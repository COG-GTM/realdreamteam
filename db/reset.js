require('dotenv').config({ override: true });

const databaseUrl = process.env.AUCTION_DATABASE_URL;
if (!databaseUrl) {
  console.error('AUCTION_DATABASE_URL is required.');
  process.exit(1);
}

let database;
try {
  database = new URL(databaseUrl);
} catch (error) {
  console.error(`Invalid AUCTION_DATABASE_URL: ${error.message}`);
  process.exit(1);
}

const remoteHosts = !['localhost', '127.0.0.1'].includes(database.hostname);
if (remoteHosts && process.env.ALLOW_REMOTE_RESET !== '1') {
  console.error(`Refusing to reset remote database host "${database.hostname}". Set ALLOW_REMOTE_RESET=1 to confirm.`);
  process.exit(1);
}

const databaseName = decodeURIComponent(database.pathname.replace(/^\//, ''));
console.log(`Resetting ${database.hostname}/${databaseName}...`);

const fs = require('node:fs');
const path = require('node:path');
const { pool, withTransaction } = require('./db');
const { seed } = require('./seed');
const { integrityReport } = require('../lib/category-admin');

async function main() {
  await withTransaction(async (client) => {
    await client.query(fs.readFileSync(path.join(__dirname, 'reset.sql'), 'utf8'));
    await seed(client);
    const report = await integrityReport(client);
    if (report.unmatchedLots.length || report.unmatchedPreferences.length) {
      throw new Error(`Category integrity check failed: ${report.unmatchedLots.length} unmatched lots, ${report.unmatchedPreferences.length} unmatched preferences.`);
    }
  });
  const tables = ['auction_houses', 'users', 'preferences', 'categories', 'auctions', 'lots', 'lot_images', 'favorites', 'bids', 'notifications'];
  const counts = [];
  for (const table of tables) {
    const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    counts.push(`${table}=${result.rows[0].count}`);
  }
  console.log(`Reset complete: ${counts.join(', ')}`);
}

main()
  .catch((error) => {
    console.error(`Reset failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
