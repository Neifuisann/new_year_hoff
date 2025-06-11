const crypto = require('crypto');

function generateETag(data) {
  if (!data) return null;
  const dataString = JSON.stringify(data, (key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce((sorted, k) => {
          sorted[k] = value[k];
          return sorted;
        }, {});
    }
    return value;
  });
  return crypto.createHash('sha1').update(dataString).digest('hex');
}

function setCacheHeaders(res, etag, maxAgeSeconds = 60) {
  if (etag) res.setHeader('ETag', `"${etag}"`);
  res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}, must-revalidate`);
}

function shouldCache(req) {
  const path = req.path || req.originalUrl || '';
  return !path.includes('/admin/') &&
    !path.includes('/api/admin/') &&
    !path.includes('/api/history') &&
    req.method === 'GET';
}

module.exports = { generateETag, setCacheHeaders, shouldCache };
