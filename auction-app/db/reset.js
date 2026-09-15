const fs = require('node:fs');
const path = require('node:path');
const { pool, withTransaction } = require('./db');
const { seed } = require('./seed');

async function main() {
  await withTransaction(async (client) => {
    await client.query(fs.readFileSync(path.join(__dirname, 'reset.sql'), 'utf8'));
    await seed(client);
  });
  const tables = ['auction_houses', 'users', 'preferences', 'auctions', 'lots', 'lot_images', 'favorites', 'bids', 'notifications'];
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
