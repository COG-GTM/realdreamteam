# Auction Interest App

## Running it

```sh
cp .env.example .env      # set the database URL/password and optionally paste a Slack webhook URL
npm install
npm start                 # http://localhost:3000
```

Set `AUCTION_DATABASE_URL` to the non-secret connection string and keep the
secret in `AUCTION_DATABASE_PASSWORD`. Use the Supabase pooler host shown in
`.env.example`; the direct `db.<project>.supabase.co` host is IPv6-only and may
be unreachable from many networks. Without a Slack webhook, matching new lots
are logged to the server console. Reset the seeded data with:

```sh
npm run db:reset -- --yes
```

### Access gate

The app uses the default codes `20240312`, `03122024`, and `12032024` for its
server-side access gate; configure the comma-separated `ACCESS_CODES` list or
share a link with `?code=...` when needed. Set `SESSION_SECRET` to a stable
secret so signed access cookies survive restarts.

## Tests

Run the test suite with:

```sh
npm test
```
