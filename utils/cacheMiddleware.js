const { getClient } = require('./redisClient');
const { shouldCache } = require('./cache');

function cache(durationSeconds = 60) {
  const client = getClient();
  return async (req, res, next) => {
    if (!shouldCache(req)) return next();
    const key = req.originalUrl;
    try {
      const cached = await client.get(key);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.send(cached);
      }

      const sendResponse = res.send.bind(res);
      res.send = (body) => {
        if (typeof body === 'string') {
          client.setEx(key, durationSeconds, body).catch(err => console.error('Redis set error', err));
        } else {
          client.setEx(key, durationSeconds, JSON.stringify(body)).catch(err => console.error('Redis set error', err));
        }
        res.setHeader('X-Cache', 'MISS');
        return sendResponse(body);
      };
      next();
    } catch (err) {
      console.error('Redis cache middleware error', err);
      next();
    }
  };
}

module.exports = cache;
