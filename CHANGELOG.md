# Changelog

## Week of 2026-09-12 – 2026-09-18

61 pull requests merged (14 Sep – 15 Sep 2026).

### Breaking changes

- #57 Removed the unused static landing site and its GitHub Pages workflow; the repo now serves only the auction app.
- #73 Flattened the repo so the auction app lives at the root with a single README.
- #75 Removed the Slack integration and its webhook notification path.
- #80 Removed the unreachable `notifications/read` route from `history.js`.
- #63 Widened money columns to `BIGINT`, changing the schema for existing databases.
- #59 Switched access codes to session cookies, so users are prompted again after the browser closes.

### Features

- #1 Added the team image and moved the site into a `src/` layout.
- #2 Added the turbine assembly image to the About section.
- #3 Added the auction app v1 design proposal.
- #18 Added mock seed data and demo-hosting decisions to the v1 design.
- #20 Added the summary page mockup, real lot images and a history page.
- #22 Added the v2 schema from the whiteboard and auction-house survey to the design doc and seed data.
- #34 Added the V1 Postgres data model (`schema.sql`, comments, docs).
- #36 Added the auction app build design for demo review.
- #39 Applied schema-review changes: notification `kind`/`read_at`, CHECK constraints and comments.
- #41 Scaffolded the auction app v1 on Supabase Postgres with real seed data.
- #43 Added the summary page (feed, matches, discover) and preferences.
- #44 Added the admin page, auction close/reopen, poller and sold/new_lot notifications.
- #46 Added auctions, lot detail, favorites, bidding and bid history.
- #47 Added demo seed data for all nine tables.
- #62 Summary now shows the 5 newest notifications with a "Show all" toggle.
- #63 Added the "Portrait of Devin" seed lot with a USD 2 trillion price tag.
- #64 Added a 6-slide overview deck generated with python-pptx.
- #65 Used the Devin otter plush photo for the Portrait of Devin lot.
- #66 Changed the entry page heading to "Let's Buy Cool Shit".
- #68 Displayed all timestamps in US Central time.
- #69 Added David Hockney to Reilly's preferences and favorites.
- #70 Seeded Mike's Devin preferences and $2T bid on Portrait of Devin.
- #71 Added a left nav plus live "Open auctions" and "Notifications" panes on every page.
- #76 Added admin-managed lot categories.
- #79 Added fun default avatars and uploadable profile pictures.
- #90 Added Cognition seed lots and renamed "Stuffed Animals" to "Toys and Clothes".
- #92 Added more Cognition seed lots with real photos.
- #93 Added bidding rules: increments, jump cap, next-bid hint, rules popup and decimal amounts.
- #97 Added simulation foundations: shadow users, activity log and Live pane.
- #99 Added realtime bid updates on the lot page via the existing poller.
- #100 Added the auction recycler: clone closed sales forward, re-offer lots, lot bank and cleanup.
- #107 Landed the simulator: shadow bidders, recycler and polish.

### Improvements

- #51 Indexed build sessions and infrastructure in design doc §10.
- #55 Rewrote the README covering how to use, change and deploy the app.
- #56 Added a README architecture overview with a rendered diagram.
- #77 Extracted gate middleware and route helpers for testability; unit tests grew 42 → 98.
- #78 Added PostgreSQL integration tests and fetch-based HTTP tests; tests grew 98 → 163.
- #91 Added background depth (glows, grain), design tokens and serif catalogue type.
- #94 Changed the entry page heading to "Know what's up for sale. Dream big. Buy big."
- #96 Added a README code-size breakdown.
- #103 Reworked the lot page as a catalogue entry: hero image, capped serif title, sticky bid panel.
- #104 Added auction header identity: house logos and city/closes/status line.
- #105 Rendered lot cards as catalogue tiles with a uniform 4:3 crop, blurred fill, mat and placeholder.

### Bug fixes

- #17 Folded design review findings into the v1 design doc.
- #52 Moved infrastructure connection details out of the design doc in the public repo.
- #53 Dropped the EC2 IP and SSH user from the README deploy notes.
- #67 Rejected bids above `Number.MAX_SAFE_INTEGER`.
- #72 Removed the EC2 host IP from public docs.
- #74 Hardened access gates and admin lot input.
- #89 Added styled 404/500 error pages and tolerated a repeated `?u=` query param.
- #95 Redirected to the profile picker instead of rendering a page without a user.
- #101 Fixed 16 stale HTTP tests and let admin/pane routes through `loadUser` without a user.
- #106 Applied lot card follow-up fixes from review of #105.
- #108 Summary lot cards show the catalogue lot number instead of the database id.
- #111 Stopped the sidebar pane poller from injecting redirected full pages.
- #112 Corrected 8 seed lots whose text and images came from the wrong Wikipedia article.
