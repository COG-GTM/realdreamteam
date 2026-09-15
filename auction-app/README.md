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

## Tests

Run the test suite with:

```sh
npm test
```
