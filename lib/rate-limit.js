function gateLimiter({ max = 10, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const hits = new Map();

  function prune(currentTime) {
    for (const [ip, entry] of hits) {
      if (currentTime - entry.startedAt >= windowMs) hits.delete(ip);
    }
  }

  function limiter(req, res, next) {
    const currentTime = now();
    const entry = hits.get(req.ip);
    req.rateLimited = Boolean(entry && currentTime - entry.startedAt < windowMs && entry.count >= max);
    next();
  }

  limiter.recordFailure = (req) => {
    const currentTime = now();
    prune(currentTime);
    const entry = hits.get(req.ip);
    if (entry && currentTime - entry.startedAt < windowMs) {
      entry.count += 1;
    } else {
      hits.set(req.ip, { count: 1, startedAt: currentTime });
    }
  };

  return limiter;
}

module.exports = { gateLimiter };
