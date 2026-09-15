// Favorite toggling shared by the lot route and the simulator. Both run inside
// the caller's transaction so the favorites row and its activity row commit
// together.
const { logActivity } = require('./activity');

// Adds the favorite if absent (plus its activity row). Returns true when a new
// favorite was created, false when it already existed.
async function addFavorite(client, { userId, lotId }) {
  const result = await client.query(
    'INSERT INTO favorites (user_id, lot_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, lotId]
  );
  if (!result.rowCount) return false;
  await logActivity(client, { kind: 'favorite', actorUserId: userId, lotId });
  return true;
}

// Toggle used by the heart button: remove if present, otherwise add.
// Returns { added }.
async function toggleFavorite(client, { userId, lotId }) {
  const removed = await client.query(
    'DELETE FROM favorites WHERE user_id = $1 AND lot_id = $2',
    [userId, lotId]
  );
  if (removed.rowCount) return { added: false };
  await addFavorite(client, { userId, lotId });
  return { added: true };
}

module.exports = { addFavorite, toggleFavorite };
