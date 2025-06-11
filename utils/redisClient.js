const { createClient } = require('redis');

const redisUrl = process.env.REDIS_URL;
const redisUsername = process.env.REDIS_USERNAME;
const redisPassword = process.env.REDIS_PASSWORD;

let client;

function getClient() {
  if (client) return client;
  client = createClient({
    url: redisUrl,
    username: redisUsername,
    password: redisPassword
  });
  client.on('error', err => console.error('Redis Client Error', err));
  client.connect().catch(err => console.error('Redis connection error', err));
  return client;
}

module.exports = { getClient };
