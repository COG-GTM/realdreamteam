# Migration map: realdreamteam

App migration wave target: run this app as a container on the internal x86
Kubernetes platform (`linux/amd64`), on Node 22 LTS, keeping the existing
Postgres database. Network zone: **intranet**.

## Runtime today

| Item | Today | Source |
| --- | --- | --- |
| Node | `>=20` (no pin); the production host runs Node 20 | `package.json` `engines`; README architecture section |
| Package manager | npm, lockfile v3 | `package-lock.json` |
| Process manager | systemd unit on a single VM, `git pull && npm ci --omit=dev && systemctl restart` | README "Deploy" |
| Front door | Caddy on the VM, TLS + reverse proxy to `:3000` | README "Deploy" |
| Container / CI | none (no Dockerfile, no `.nvmrc`, no workflows) | repo root |
| Build step | none (plain Express + EJS, no bundler) | `package.json` scripts |

## Dependencies and Node 22

All six runtime dependencies are pure JavaScript; there are no native addons,
no `node-gyp` builds and no postinstall scripts.

| Package | Locked | Node 22 status |
| --- | --- | --- |
| express | 5.2.1 | supported (`engines >=18`) |
| pg | 8.23.0 | supported, pure JS client (no `pg-native`) |
| ejs | 3.1.10 | supported |
| multer | 2.3.0 (pinned exactly) | supported; in-memory storage only |
| cookie-parser | 1.4.7 | supported |
| dotenv | 17.4.2 | supported |

Known breaks on Node 22: **none found**. The test suite uses the built-in
`node:test` runner and global `fetch`, both stable on Node 22.

Not changed by this migration, flagged for follow-up: `npm audit` reports
advisories in `multer` (pinned 2.3.0), `body-parser` and `proxy-addr`
(transitive via express). They are unrelated to the Node version.

## Datastores, caches, buckets

| Kind | What | Notes |
| --- | --- | --- |
| Postgres | one database, 11 tables (`db/schema.sql` + `db/migrations/`) | hosted managed Postgres today; TLS with `rejectUnauthorized: false` for any non-localhost host (`db/db.js`) |
| Uploaded files | user avatars stored in Postgres (`users.avatar_data` BYTEA) via multer memory storage | no filesystem or bucket writes |
| Cache | none | process is stateless; cookies are signed, not stored |
| Object storage / S3 | none | static assets ship in `public/`; lot images are hot-linked |

## External services

| Service | Called by | Direction |
| --- | --- | --- |
| Postgres | server (`pg`) | outbound from the pod, port 5432 |
| upload.wikimedia.org / en.wikipedia.org | the **browser** (lot images and source links in seed data) | not called by the server |
| fonts.googleapis.com | the browser (`views/`) | not called by the server |

The server makes no outbound HTTP calls of its own.

## Environment variables

| Variable | Read in | Required | Secret |
| --- | --- | --- | --- |
| `AUCTION_DATABASE_URL` | `db/db.js`, `db/reset.js` | yes | host/user only (password separate) |
| `AUCTION_DATABASE_PASSWORD` | `db/db.js` | when the role has a password | **yes** |
| `AUCTION_TEST_DATABASE_URL` | `db/db.js` (`NODE_ENV=test`) | tests only | no |
| `ACCESS_CODE` | `server.js` | yes in production | **yes** |
| `ADMIN_CODE` | `routes/admin.js` | yes in production | **yes** |
| `COOKIE_SECRET` | `server.js` | yes in production | **yes** |
| `NODE_ENV` | `server.js`, `lib/cookies.js`, `db/db.js` | `production` in the platform | no |
| `PORT` | `server.js` | default `3000` | no |
| `POLL_SECONDS` | `lib/poller.js` | default `5` | no |
| `SIM_ENABLED`, `SIM_MIN_SECONDS`, `SIM_MAX_SECONDS`, `SIM_IDLE_SECONDS`, `SIM_IDLE_CHECK_SECONDS`, `SIM_MIN_OPEN_AUCTIONS`, `SIM_MIN_UPCOMING_AUCTIONS` | `lib/sim/*.js` | defaults in code | no |
| `ALLOW_REMOTE_RESET` | `db/reset.js` | never set in the platform | no |

`server.js` and the `db/` scripts call `dotenv.config({ override: true })`.
In the container there is no `.env` file (excluded by `.dockerignore`), so
values come only from the pod environment.

## Ports and health

- HTTP on `PORT` (3000).
- Every route sits behind the site-code gate, so this migration adds an
  unauthenticated `GET /healthz` before the gate: it runs `SELECT 1` and
  returns `200 {"status":"ok"}` or `503` when Postgres is unreachable. Used by
  the Dockerfile `HEALTHCHECK` and the Kubernetes probes.

## Build steps

`npm ci --omit=dev` and `node server.js`. No compile, no asset pipeline.
On first boot `seedIfEmpty()` loads `data/seed/*.json` only when the database
is empty; `npm run db:reset` is a manual operation and is never run by the
container.

## Secrets today

The production host keeps every secret in a mode-600 `.env` file next to the
checkout, read by systemd/dotenv. Nothing is injected at build time and the
repo contains only development defaults (`.env.example`).

Target: the image contains no secrets. In the platform, `COOKIE_SECRET`,
`ACCESS_CODE`, `ADMIN_CODE` and `AUCTION_DATABASE_PASSWORD` come from a
Kubernetes Secret populated by an `ExternalSecret`; non-secret settings come
from a ConfigMap.

## Target design

| Concern | Moves | Stays |
| --- | --- | --- |
| Compute | VM + systemd + Caddy → Deployment (Node 22, non-root) + Service + Ingress | |
| TLS | Caddy → platform ingress controller | |
| Database | | existing Postgres; same schema, same connection settings |
| Static assets | baked into the image (`public/`) | |
| Images in lots | | hot-linked from the browser, no change |
| Deploys | `git pull` on the VM → image built in GitHub Actions, digest pinned in `platform/dev/realdreamteam/` | |

Network path needed (intranet zone): pod → existing Postgres endpoint on
TCP 5432 with TLS. No inbound path other than the ingress; no other egress
from the server. Because the platform can reach the existing database, no data
moves in this wave.

Replicas: start with one replica to match today's single-process behaviour.
The simulator serialises across processes with a Postgres advisory lock; the
5 s poller has not been reviewed for running in several pods at once.
