# Auction Interest App

## Running it

```sh
cp .env.example .env      # optionally paste a Slack webhook URL
npm install
npm start                 # http://localhost:3000
```

The app stores its SQLite database in `data/app.db`. Delete that file to reset
the seeded data. Without a Slack webhook, matching new lots are logged to the
server console.

## Tests

Run the test suite with:

```sh
npm test
```
