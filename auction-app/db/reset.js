require('dotenv').config();

if (!process.argv.includes('--yes')) {
  console.error('Refusing to reset the database without the explicit --yes flag');
  process.exitCode = 1;
} else {
  const { pool, withTransaction, init } = require('./db');

  (async () => {
    try {
      await withTransaction(async (client) => {
        for (const table of [
          'notifications',
          'bids',
          'tickets',
          'likes',
          'preferences',
          'items',
          'events',
          'users'
        ]) {
          await client.query(`DROP TABLE IF EXISTS ${table}`);
        }
      });
      await init();
      console.log('Auction database reset and seeded');
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  })();
}
