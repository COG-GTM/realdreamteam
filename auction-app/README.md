# Auction Interest

A small, server-rendered auction demo for collecting interest in lots. It uses
Express, EJS, SQLite, and seeded JSON files. There is no login or build step.

## Setup

```bash
cp .env.example .env
npm install
npm start
```

Open <http://localhost:3000>. A Slack webhook is optional; without one,
notifications are printed to the server console.

To reset the demo, stop the server and delete `data/app.db`. The next start
recreates the schema and loads all seed files.

## Golden path

1. Choose Mark Porter on the home page.
2. Review the matched Kusama and Banksy lots.
3. Open `/admin`, add a London lot named **Pumpkin (Blue)** by **Yayoi Kusama**.
4. Favorite the new lot, place a bid, and book a ticket.
5. Close the London sale from `/admin` to show the SOLD state.

## Two-tab bidding demo

Open these two pages in separate tabs:

- Tab 1: `/u/1/summary` — Mark Porter
- Tab 2: `/u/2/summary` — Christian Wencel

From `/admin`, add lot 107, **Pumpkin (Blue)**, to the London sale with an
estimate of £50,000–£70,000. Bid £55,000 as Mark, then bid back and forth as
Christian. Close the London sale through `/admin`; the lot detail shows the
winner and hammer price.

## Replacing the SOLD sound

Replace `public/sold.mp3` with another short, locally owned MP3. The admin SOLD
banner will play the file automatically when the browser permits autoplay, and
also provides a play button.
