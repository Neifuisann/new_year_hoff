const { createClient } = require('redis');

// Initialize Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

// Add error handling
redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

// Connection management
let isConnected = false;

// Connect to Redis or return existing connection
async function getRedisClient() {
  if (!isConnected) {
    await redisClient.connect();
    isConnected = true;
    console.log('Connected to Redis');
  }
  return redisClient;
}

// Cache middleware - automatically caches responses based on request URL
async function cacheMiddleware(req, res, next) {
  // Skip if we shouldn't cache this route
  if (!shouldCache(req)) {
    return next();
  }

  try {
    const redis = await getRedisClient();
    const cacheKey = `page:${req.originalUrl || req.url}`;
    
    // Try to get cached response
    const cachedResponse = await redis.get(cacheKey);
    
    if (cachedResponse) {
      const { headers, body, statusCode } = JSON.parse(cachedResponse);
      
      // Restore headers from cache
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      
      // Add cache hit header for debugging
      res.setHeader('X-Cache', 'HIT');
      
      // Send cached response
      return res.status(statusCode).send(body);
    }
    
    // No cache - capture the response
    const originalSend = res.send;
    
    res.send = function(body) {
      // Store original arguments to pass to the original function later
      const args = arguments;
      
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const headers = {};
        
        // Get relevant headers for caching
        const headerNames = res.getHeaderNames();
        headerNames.forEach(name => {
          headers[name] = res.getHeader(name);
        });
        
        // Don't cache if Cache-Control: no-store is set
        const cacheControl = res.getHeader('Cache-Control');
        if (cacheControl && cacheControl.includes('no-store')) {
          return originalSend.apply(res, args);
        }
        
        // Prepare data to cache
        const cacheData = {
          headers,
          body,
          statusCode: res.statusCode
        };
        
        // Calculate cache expiry time from Cache-Control max-age if present
        let expiry = 60; // Default 60 seconds
        if (cacheControl && cacheControl.includes('max-age=')) {
          const match = cacheControl.match(/max-age=(\d+)/);
          if (match && match[1]) {
            expiry = parseInt(match[1], 10);
          }
        }
        
        // Store in Redis with expiry
        redis.set(cacheKey, JSON.stringify(cacheData), { EX: expiry })
          .catch(err => console.error('Redis cache set error:', err));
          
        // Add cache miss header for debugging
        res.setHeader('X-Cache', 'MISS');
      }
      
      // Call the original send function
      return originalSend.apply(res, args);
    };
    
    next();
  } catch (error) {
    console.error('Redis caching error:', error);
    next(); // Continue without caching on error
  }
}

// Clear cache for specific routes
async function clearCache(pattern) {
  try {
    const redis = await getRedisClient();
    
    if (!pattern) {
      return console.error('No pattern provided for cache clearing');
    }
    
    // Use SCAN to avoid blocking Redis with KEYS command
    let cursor = '0';
    
    do {
      const result = await redis.scan(cursor, {
        MATCH: `page:${pattern}*`,
        COUNT: 100
      });
      
      cursor = result.cursor;
      const keys = result.keys;
      
      if (keys.length > 0) {
        await redis.del(keys);
        console.log(`Cleared ${keys.length} cache entries matching pattern: ${pattern}`);
      }
    } while (cursor !== '0');
    
  } catch (error) {
    console.error('Redis cache clearing error:', error);
  }
}

// Import shouldCache function from api/index.js
function shouldCache(req) {
  const path = req.path || req.originalUrl || '';
  // Don't cache admin routes or authenticated routes that need fresh data
  return !path.includes('/admin/') && 
         !path.includes('/api/admin/') &&
         !path.includes('/api/history') &&
         req.method === 'GET'; // Only cache GET requests
}

// Utility functions for common Redis operations
async function getJson(key) {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Redis getJson error:', error);
    return null;
  }
}

async function setJson(key, value, expiry = 3600) {
  try {
    const redis = await getRedisClient();
    await redis.set(key, JSON.stringify(value), { EX: expiry });
    return true;
  } catch (error) {
    console.error('Redis setJson error:', error);
    return false;
  }
}

async function deleteKey(key) {
  try {
    const redis = await getRedisClient();
    await redis.del(key);
    return true;
  } catch (error) {
    console.error('Redis deleteKey error:', error);
    return false;
  }
}

module.exports = {
  getRedisClient,
  cacheMiddleware,
  clearCache,
  getJson,
  setJson,
  deleteKey
}; 