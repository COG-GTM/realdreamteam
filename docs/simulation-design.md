# "Living Auction House" — simulation design

Status: **implemented (PRs #97, #98, #100, and this PR)**. Builds on
[`build-design.md`](build-design.md) and the frozen schema in
[`schema.md`](schema.md); nothing here changes how a real user bids.

What differs from the plan:

- `respond_outbid` picks one beaten-shadow candidate via `rng.pick` and then
  applies the aggression gate, rather than iterating all candidates.
- Sniper personas are ineligible on auctions with `closes_at IS NULL` (there is
  no "last 10%" to wait for).
- The fairness throttle (`lastShadowOutbid`) and the 300-actions/hour cap live
  in process memory, not in the database — they reset on restart.
- `unsell` is not implemented (sold lots re-offer via cloning instead).
- The wake-up burst is skipped if an action ran in the last 10 minutes.
- `publish_lot` (weight 8) and `close_early` (weight 2) are implemented;
  `new_lot` as a distinct sim action is covered by `publish_lot` going through
  the `createLot` seam.

## 1. Goal

When someone is on the site, it should feel like a busy auction house: bids
landing, prices creeping up, lots getting outbid, auctions closing with a
hammer, new lots arriving — even if that person is the only human online.
When nobody is online, nothing happens and the database does not grow.

It has to run **forever** without a human resetting data: the current seed is a
fixed week in September 2026, so within days every auction is closed and the
site is a museum.

## 2. What is wrong with the simplest version

Mark's sketch: an agent every 5–30 s that unsells an old lot, resurrects an old
unsold lot, or bids on an open lot, with ~50 hidden users. Three things I would
change, and why:

1. **Don't "unsell" inside a closed auction.** A closed auction has hammer
   prices, winners and `sold` notifications that real users already saw.
   Flipping a lot back to unsold rewrites history the user remembers. Real
   houses never do that either; they **re-offer** bought-in (unsold) lots in the
   next sale. So: clone auctions forward in time and re-offer lots there
   (§5). History stays true, and the "auctions" list shows real turnover:
   *closed → upcoming → open → closed*.
2. **The feed the user sees is personal.** The right-hand "Notifications" pane
   only shows `outbid` / `new_lot` / `sold` rows *for that user*. Random shadow
   bids on random lots are invisible to them. Two fixes: (a) shadow bidders
   deliberately target lots the human has bid on or favorited (so they get
   outbid, §6.3), and (b) add a site-wide **Live activity** ticker (§7) so *all*
   movement is visible, including before a user is picked.
3. **No login timeout needed.** The site already knows who is "there": every
   open, visible tab polls `/panes/*` every 3 s (`views/layout.ejs`), and
   stops when the tab is hidden. That poll is the presence heartbeat (§4). A
   60-minute *idle* cut-off lives in the browser (stop polling after 60 min
   without mouse/keyboard), which is gentler than logging people out and has
   the same effect on the simulator.

## 3. Architecture

One new module, `lib/sim/`, started from `server.js` next to the poller. Same
process, same `pg` pool, same rules: shadow users bid through
`lib/bids.placeBid`, auctions close through `lib/close.closeAuction`, lots are
published through `lib/new-lot`. The simulator never writes bids or
notifications directly, so increments, jump caps, outbid notifications and
matching all stay in one place.

```
lib/sim/
  index.js        start()/stop(); the scheduler loop (setTimeout, jittered)
  presence.js     "is anyone here?" — last heartbeat, idle window
  director.js     picks the next action from weighted candidates (§6)
  shadow.js       shadow-user personas, bid sizing, target selection
  recycle.js      clone a closed auction forward, re-offer lots (§5)
  activity.js     write/read the site-wide activity log (§7)
```

Scheduler loop:

```
async function tick() {
  if (!presence.anyoneActive()) return sleep(SIM_IDLE_CHECK_SECONDS)   // 30 s
  if (!(await tryAdvisoryLock(SIM_LOCK_ID))) return sleep(30)            // one runner only
  const action = await director.choose()                                // §6
  if (action) await action.run()                                        // one action per tick
  return sleep(jitter(SIM_MIN_SECONDS, SIM_MAX_SECONDS))                 // 5–30 s
}
```

Env (all with defaults, all documented in `.env.example` and README §Environment):
`SIM_ENABLED=true`, `SIM_MIN_SECONDS=5`, `SIM_MAX_SECONDS=30`,
`SIM_IDLE_SECONDS=90` (no heartbeat for this long → asleep),
`SIM_MIN_OPEN_AUCTIONS=3`, `SIM_MIN_UPCOMING_AUCTIONS=1`. Tests run with
`SIM_ENABLED=false`; the admin page has an on/off switch and a "run one action
now" button for demos (§8).

## 4. Presence — only run when someone is using the site

- `GET /panes/*` already fires every 3 s from every visible tab. Add one line
  in `routes/panes.js`: `presence.touch(userIdOrNull)`. In-memory
  `Map<userId|'anon', lastSeenAt>`; nothing persisted (single process, and the
  README already promises the process is stateless and restartable).
- `anyoneActive()` = any entry newer than `SIM_IDLE_SECONDS` (90 s covers a
  few missed polls).
- **Idle cut-off in the browser**: the pane script stops polling after 60 min
  with no `mousemove/keydown/scroll/click`, and shows a small "paused — click to
  resume" note on the panes. A forgotten tab on a second monitor therefore
  stops driving the simulator after an hour. This replaces the proposed
  60-minute login timeout; the access cookie stays a session cookie as today.
- Presence also tells the director *who* is here (§6.3): shadow bidders pick
  on the humans currently online.
- Wake-up burst: when presence flips from nobody → somebody after a long
  sleep, the site would look frozen (last bid hours ago). The director runs a
  **catch-up**: 3–6 quick actions in the first 20 s, and back-dates nothing.
  Honest timestamps; it just looks like people arrived at the same time.

## 5. Auctions that run forever — the recycler

Every tick the director first checks the calendar (cheap `COUNT`s):

| Condition | Action |
|---|---|
| open auctions < `SIM_MIN_OPEN_AUCTIONS` and an upcoming one exists | do nothing; the poller opens it when `starts_at` passes (make sure the nearest `starts_at` is within ~30 min, else pull it forward) |
| upcoming auctions < `SIM_MIN_UPCOMING_AUCTIONS` | **clone** the oldest closed auction forward (below) |
| an open auction has been open > 7 days with `closes_at` NULL | give it a `closes_at` 1–3 days out |

**Clone forward** (`recycle.js`, one transaction):

- New `auctions` row: same house, `title` reused (real houses repeat titles —
  "Contemporary Evening Sale" happens every season), `house_ref` =
  original + season suffix (`L26021` → `L26021-S2`, unique per house),
  `starts_at` = now + 10–120 min, `closes_at` = starts + 1–5 days
  (`format = 'timed'`), `cloned_from_auction_id` = original.
- Lots: **all unsold lots** of the original (hammer NULL) re-offered with the
  same lot numbers, plus **~30% of the sold lots** re-offered ("from a private
  collection"), plus **2–5 lots from the lot bank** (§5.1) that have not been
  seen for the longest time. `reoffered_from_lot_id` points at the source so
  the lot page can say *Previously offered in … (unsold)* or
  *(sold for £55,000)*. Estimates drift ±10%; starting bid recomputed. Images
  copied.
- No bids, favorites or notifications are copied. Real users' history on the
  original lot is untouched.
- Because the original stays closed, the *Auctions* page keeps showing a
  growing history. Cap it: the auctions list shows the last 12 closed
  auctions; older closed auctions (> 90 days) and their lots/bids/notifications
  are deleted by a nightly step of the same loop so the Supabase database stays
  small. (Bids from shadow users at ~1 action / 15 s while someone is online is
  a few thousand rows a day at most.)

### 5.1 Lot bank

`data/seed/lots.json` already holds 262 lots. That is the bank: a lot is
"available" if no *open or upcoming* auction currently offers a lot with the
same `source_url`. Re-offering picks the longest-unseen available lots. Nothing
new to invent, and adding to the bank stays the existing seed workflow
(`npm run db:reset` reloads it). Later the bank can grow with a
`data/seed/lots-extra.json` that is *only* read by the recycler (not the initial
reset) if we want more variety.

## 6. Shadow users and what they do

### 6.1 Who

50 users in `data/seed/shadow_users.json`, `users.shadow = true`
(new column, migration 006). Realistic full names, no emails, default avatars,
**each with a `preferences` row** (2–4 categories, 0–2 artists, 0–3 keywords)
and a persona stored in `users.persona JSONB`:

```json
{ "budget": 1.4,        // multiplier on estimate_high they will chase up to
  "aggression": 0.6,    // chance to respond when outbid (0.2 collector … 0.9 dealer)
  "sniper": false,      // prefers the last 10% of an auction's life
  "activity": 0.8 }     // relative pick frequency
```

Shadow users are hidden from the profile picker (`/`), from admin's user list
(shown in a collapsed "50 simulated bidders" section with one *ban all* /
*unban all*), and never receive notification rows (skip inserts when the
recipient is shadow — nobody reads them and they would dominate the table).
They **do** appear as bidders in bid histories, as high bidder on cards, and
as winners — that is the point.

### 6.2 Bid sizing

`nextBid()` from `lib/bids.js` gives the minimum. A shadow bidder bids the
minimum 70% of the time, one extra increment 25%, and a "statement" jump
(within `maxBid()`'s cap) 5%. It never bids above `estimate_high × budget`,
and never bids on a lot where it is already the high bidder (the rules reject
that anyway).

### 6.3 Picking a target lot (weighted)

| Weight | Target |
|---|---|
| 35 | a lot a **human currently online** is high bidder on or has favorited (this produces the `outbid` notifications that make the feed move) — but see the fairness rule |
| 25 | a lot in the shadow user's preferred categories/artists |
| 20 | a lot in an auction closing within 2 hours ("ending soon" heat) |
| 15 | a lot with the most bids in the last hour (herding) |
| 5 | any open lot with no bids yet (first bid at starting price) |

**Fairness rule** (so humans can still win things): a shadow user never outbids
a human in the **last 15 minutes** before that auction closes, and at most
**one shadow outbid per human per 10 minutes**. Otherwise the human experience
is "the bots always win", which is the opposite of fun.

### 6.4 Action mix per tick

| Weight | Action | Notes |
|---|---|---|
| 60 | place a bid | §6.2–6.3 |
| 15 | favorite a lot | cheap, shows up as favorite counts if we add them to cards |
| 10 | respond to being outbid | a shadow user who was outbid in the last 30 min bids back, gated by `aggression` — creates natural bidding *wars* between shadows on the same lot, visible in the lot's bid history |
| 8 | publish a new lot | via `lib/new-lot`: pull the longest-unseen bank lot into an open auction as the next lot number → `new_lot` notifications for humans whose preferences match |
| 5 | nothing | quiet moments are part of realism |
| 2 | close an auction early | only if `closes_at` is within 30 min anyway; produces the SOLD ribbon + sound + `sold` notifications |

Pacing follows what real timed auctions look like: activity is roughly flat
for most of an auction's life and rises sharply in the last hours (the eBay
"sniping" pattern documented by Roth & Ockenfels, 2002). Concretely, a lot's
selection weight is multiplied by `1 + 3 × (1 − timeLeft/duration)²`, and
personas with `sniper: true` are only eligible in the last 10%. With auctions
cloned 1–5 days long and staggered, some auction is always "ending soon".

## 7. Live activity — making it visible

New table `activity` (migration 006) written by *both* human and shadow
actions, inside the same transactions:

```
activity(id, kind, actor_user_id, lot_id, auction_id, amount, detail, created_at)
kind ∈ bid | favorite | new_lot | reoffered | opened | closed | sold | reopened
(outbids live in `bid.detail`, e.g. "outbid Priya R.", not in a separate kind)
```

- New pane **Live** (third pane, or replacing the empty "Pick a user to see
  your feed" state): last 15 events site-wide, e.g. *Priya R. bid £6,250 on
  Untitled (Skull) · 12 s ago*, *Sotheby's opened "Contemporary Evening Sale"*,
  *SOLD — Vintage Rolex to Marcus T. for $8,400*. Refreshes with the existing
  3 s poll; new rows get the existing `fresh` highlight. Visible on `/enter`
  too? No — keep it behind the site code.
- Auctions pane: add **Ending soon** ordering (already sorted by `closes_at`)
  with a countdown for anything under 2 hours.
- Lot cards: bid count + "3 watching" (favorites count, shadows included).
- Admin page: a **Simulation** box (§8).

This pane is what makes the site feel alive even for a user nobody is
outbidding; the personal Notifications pane keeps its meaning.

## 8. Admin controls and observability

On `/admin`:

- Switch: **Simulation on/off** (runtime flag, also honours `SIM_ENABLED`).
- Status: asleep/awake, humans online (names), last 10 sim actions, actions
  in the last hour, next scheduled tick.
- Buttons: *Run one action now*, *Clone next auction now*, *Wake for 10 min*
  (forces presence — for showing the demo from a projector where nobody
  polls).
- Guard rail: the simulator refuses to act on a user with `banned = true`, and
  banning a shadow user works like banning anyone else.

Logs: one line per action, `[sim] Priya R. bid 6250 on lot 118 (outbid Mark)`,
same style as `[poller]`.

## 9. Build plan

Four PRs, each shippable on its own; roughly two Devin sessions total.

| PR | Scope | Verifies |
|---|---|---|
| 1 · Foundations | migration 006 (`users.shadow`, `users.persona`, `auctions.cloned_from_auction_id`, `lots.reoffered_from_lot_id`, `activity` table + index); `shadow_users.json` + loader; hide shadows from picker/admin/notifications; `activity` writes from `placeBid`, `closeAuction`, `new-lot`, favorites; Live pane. | unit: activity rows per action; http: picker excludes shadows; Live pane renders |
| 2 · Presence + bidder | `lib/sim/{index,presence,director,shadow}.js`; heartbeat in `routes/panes.js`; browser idle cut-off; bid / favorite / respond-to-outbid / nothing actions; fairness rule; admin Simulation box with on/off + run-now; env + README. | unit: director weights and fairness are pure functions with seeded RNG; integration: a tick against `rdt_test` inserts a valid bid and an `outbid` notification for the human |
| 3 · Recycler | `recycle.js`: clone forward, re-offer rules, lot bank, calendar check, early close, 90-day cleanup; "Previously offered" line on lot page; admin *Clone next auction now*. | integration: closing the last open auction leads to an upcoming clone within one tick; unique `house_ref`; original untouched |
| 4 · Polish | publish-new-lot action; ending-soon countdown; bid/watch counts on cards; wake-up burst; sniping curve; deploy notes (`git pull && systemctl restart`, migration 006 applied to Supabase once). | manual run against local Postgres for an hour; check row growth |

Risks and how they are handled:

- **Runaway writes** if presence is wrong → hard ceiling of 300 sim actions
  per hour regardless of presence, and the admin switch.
- **Two processes** (deploy overlap) → Postgres advisory lock around each tick.
- **Tests** → `SIM_ENABLED=false` in the test helper; all sim logic that makes
  decisions is pure and takes an injected RNG, so tests are deterministic.
- **Seeing through it** — the tell-tale of a simulation is regularity. Jittered
  intervals, the 5% "nothing", bidding wars between shadows, personas with
  different budgets, and the ending-soon curve are all there to break rhythm.

## 10. Decisions needed from Mark

1. **Re-offer in cloned auctions instead of unselling in place** (§2.1) — OK?
2. **Shadow bidders may outbid humans**, with the fairness rule in §6.3 — OK,
   or should humans always be able to win by simply bidding back?
3. **Live activity pane** visible to everyone behind the site code (§7) — OK?
4. **Browser 60-min idle pause instead of a login timeout** (§4) — OK?
5. Shadow user names: invented realistic names, or something obviously
   playful (otters, famous collectors)? Invented realistic is the proposal.
