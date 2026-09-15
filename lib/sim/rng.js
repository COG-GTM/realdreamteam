// Deterministic RNG (mulberry32) so every simulator decision is reproducible
// in tests: inject makeRng(seed) instead of using Math.random.
function makeRng(seed = 1) {
  let state = seed >>> 0;

  function float() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min, max) {
    return min + Math.floor(float() * (max - min + 1));
  }

  function pick(array) {
    return array[Math.floor(float() * array.length)];
  }

  // entries: [{weight, value}] — returns one value, proportional to weight.
  function weighted(entries) {
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) return null;
    let roll = float() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll < 0) return entry.value;
    }
    return entries[entries.length - 1].value;
  }

  return { float, int, pick, weighted };
}

module.exports = { makeRng };
