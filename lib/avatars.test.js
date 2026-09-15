const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultAvatars, pickDefaultAvatar, validateUpload, avatarSrc, isDefaultAvatar, initials } = require('./avatars');

test('default library is non-empty and served from /avatars/defaults', () => {
  assert.ok(defaultAvatars.length >= 40);
  assert.ok(defaultAvatars.every(isDefaultAvatar));
});

test('pickDefaultAvatar is deterministic for a name', () => {
  assert.equal(pickDefaultAvatar('Mark'), pickDefaultAvatar('Mark'));
});

test('pickDefaultAvatar prefers the least-used icon', () => {
  const pool = ['/avatars/defaults/a.svg', '/avatars/defaults/b.svg'];
  const usage = new Map([[pool[0], 3]]);
  assert.equal(pickDefaultAvatar('Anyone', usage, pool), pool[1]);
});

test('seeding 28 names over 49 icons yields distinct icons', () => {
  const usage = new Map();
  const seen = new Set();
  for (let i = 0; i < 28; i++) {
    const url = pickDefaultAvatar(`User ${i}`, usage);
    usage.set(url, (usage.get(url) || 0) + 1);
    seen.add(url);
  }
  assert.equal(seen.size, 28);
});

test('validateUpload rejects missing, wrong type and oversized files', () => {
  assert.equal(validateUpload(undefined).ok, false);
  assert.equal(validateUpload({ mimetype: 'text/plain', buffer: Buffer.from('x') }).ok, false);
  assert.equal(validateUpload({ mimetype: 'image/png', buffer: Buffer.alloc(3 * 1024 * 1024) }).ok, false);
  assert.equal(validateUpload({ mimetype: 'image/png', buffer: Buffer.from('x') }).ok, true);
});

test('avatarSrc prefers an upload over the default url', () => {
  assert.equal(avatarSrc({ id: 7, has_upload: true, avatar_url: '/avatars/defaults/fox.svg' }), '/avatars/7');
  assert.equal(avatarSrc({ id: 7, has_upload: false, avatar_url: '/avatars/defaults/fox.svg' }), '/avatars/defaults/fox.svg');
  assert.equal(initials('Mark Porter'), 'MP');
});
