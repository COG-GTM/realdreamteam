# Auction Interest App

## Running it

```sh
cp .env.example .env      # set AUCTION_DATABASE_URL and optionally paste a Slack webhook URL
npm install
npm start                 # http://localhost:3000
```

The app uses Supabase Postgres through `AUCTION_DATABASE_URL`. Without a Slack
webhook, matching new lots are logged to the server console. Reset the seeded
data with:

```sh
npm run db:reset -- --yes
```

## Tests

Run the test suite with:

```sh
npm test
```
