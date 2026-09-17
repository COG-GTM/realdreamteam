# Changelog

## Week of 10–17 Sep 2026

61 pull requests merged (#1–#112).

### Breaking changes

- #75 — Slack integration removed: webhook delivery, the `sent_at` column and related docs are gone.
- #57 — The static landing site and its GitHub Pages workflow are deleted; the repo now serves only the auction app.
- #73 — Repository flattened to a single app at the root with one README; `auction-app/` paths no longer exist.
- #59 — Access codes are now session cookies, so everyone must re-enter their code after the rollout and on each new browser session.
- #93 — Money columns widened to `NUMERIC(16,2)`; existing databases need the migration before trillion-scale lots load.
- #95 — Pages without a selected user redirect to the profile picker instead of rendering anonymously.

### Features

- #107 — Presence tracking plus a shadow-bidder simulator that drives lifelike auction activity.
- #100 — Auction recycler clones closed auctions forward and keeps the demo calendar populated.
- #97 — Simulation foundations: shadow users, an activity log and a Live pane.
- #99 — Lot page bid panel and bid history now refresh live through the existing 3s poller.
- #93 — Bidding rules: increment tables, a jump cap, next-bid hints, a rules popup and decimal amounts.
- #104 — Auction header shows house logo, city, closing time and status.
- #103 — Lot page reworked as a catalogue entry with hero image, serif title and sticky bid panel.
- #105 — Lot cards render as catalogue tiles with a uniform 4:3 crop, blurred fill and mat/shadow.
- #71 — Left nav with live open-auctions and notification panes on every page.
- #62 — Summary shows the 5 newest notifications with a "Show all" toggle.
- #91 — Visual refresh: layered background glows, grain, design tokens and serif catalogue type.
- #79 — Fun default avatars and uploadable profile pictures.
- #76 — Admin-managed lot categories.
- #68 — All timestamps display in US Central time.
- #66 / #94 — New homepage and entry-page headings.
- #90 / #92 / #63 / #65 / #69 / #70 — Seed content: Cognition lots, the Devin shroud, Portrait of Devin, real product photos and extra user preferences.
- #41 / #43 / #44 / #46 / #47 — Initial auction app: Postgres scaffold, summary/preferences, auctions, lots, favorites, bidding, history, admin close/reopen, poller and notifications, plus full seed data (28 users, 8 auctions, 250 lots).
- #64 — Generator for a 6-slide overview deck via python-pptx.
- #1 / #2 — Team and turbine images for the original site.

### Bug fixes

- #112 — Eight seed lots had text and images taken from the wrong Wikipedia article.
- #111 — A redirected full page could be injected into a sidebar pane.
- #108 — Summary open-lots cards were missing catalogue lot numbers.
- #106 — Lot card fixes: backdrop image instead of inline style, blur behind portrait tiles, lot 0 label.
- #101 — Admin and pane routes no longer break when no user is loaded.
- #89 — Styled 404/500 pages; malformed or repeated `?u=` params no longer error, and render errors are never echoed to the client.
- #67 — Bids above `Number.MAX_SAFE_INTEGER` are rejected so amounts stay exact.
- #74 — Hardened access gates and admin lot input validation.
- #80 — Removed an unreachable notifications-read route.
- #72 / #53 / #52 — EC2 host IP, SSH user and other infrastructure details removed from public docs.
- #17 — Design review fixes: notification retry, base URL, route mounting and foreign keys.

### Improvements

- #77 / #78 — Gate middleware and route helpers extracted for testability; Postgres integration and HTTP tests added (98 → 163 tests).
- #96 — README gained a code-size breakdown.
- #56 / #55 / #51 — README architecture overview with diagram, Caddy TLS deploy notes and a build-session index.
- #34 / #36 / #39 / #22 / #20 / #18 / #3 — Data model and design docs: v1 and v2 schema proposals, schema-review decisions, summary mockup and seed-data planning.
