// Gives every user without a default icon one from public/avatars/defaults.
// Safe to re-run: only touches rows whose avatar_url is NULL or not a default.
require('dotenv').config({ override: true });
const { pool, withTransaction } = require('./db');
const { pickDefaultAvatar, defaultAvatarUsage, isDefaultAvatar } = require('../lib/avatars');

async function main() {
  const updated = await withTransaction(async (client) => {
    const usage = await defaultAvatarUsage(client);
    const { rows } = await client.query('SELECT id, name, avatar_url FROM users ORDER BY id FOR UPDATE');
    let count = 0;
    for (const user of rows) {
      if (isDefaultAvatar(user.avatar_url)) continue;
      const url = pickDefaultAvatar(user.name, usage);
      usage.set(url, (usage.get(url) || 0) + 1);
      await client.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url, user.id]);
      count++;
    }
    return count;
  });
  console.log(`Assigned default avatars to ${updated} user(s).`);
}

main().catch((error) => {
  console.error(`Avatar assignment failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => pool.end());
