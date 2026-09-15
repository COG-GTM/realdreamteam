---
name: auction-app-local-testing
description: Run the auction-app backend locally and verify seeded users, fixture polling, and console notifications without external services.
---

# Local auction app testing

## Runtime setup
- Work from `auction-app/`, not the static site at the repository root.
- Source nvm and run `nvm use 20` in each shell that runs Node/npm. Verify `node --version`: shell startup banners may not reflect the final PATH.
- Run `npm install`. If an existing better-sqlite3 binary reports NODE_MODULE_VERSION mismatch after switching Node versions, run `npm rebuild better-sqlite3` under the intended Node version.
- Run `npm start`; default URL is `http://localhost:3000`.
- No authentication or .env is required. With no `SLACK_WEBHOOK_URL`, notifications go to server stdout; capture that output for evidence.

## Devin Secrets Needed
- None for the local console-notification flow.
- `SLACK_WEBHOOK_URL` only when explicitly testing real Slack delivery.

## Data and polling
- Stop the server before deleting `data/app.db` for a clean seed run.
- The seeds in `data/seed/` are loaded when the database is empty.
- To test real ingestion, append a unique item ID to `data/seed/items.json`, using an existing event ID and valid estimate fields. Wait for the real 30-second interval; do not manually call tick when proving scheduling.
- Compare item count, matching notification recipients, non-null `sent_at`, and server messages. Wait another interval to verify no duplicate delivery.
- For malformed fixture recovery, wait until a JSON error is actually logged, restore valid JSON with another new ID, and verify ingestion resumes.
- Use a direct read-only better-sqlite3 connection for observations; importing db/db.js can create/seed the database.
- Restore seed files exactly and stop the server before removing the test database.
