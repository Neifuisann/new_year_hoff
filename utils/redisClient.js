const { createClient } = require('redis');

const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST;
const redisPort = process.env.REDIS_PORT;
const redisUsername = process.env.REDIS_USERNAME;
const redisPassword = process.env.REDIS_PASSWORD;

let client;

function getClient() {
  if (client) return client;
  const options = {
    username: redisUsername,
    password: redisPassword
  };

  if (redisUrl) {
    options.url = redisUrl;
  } else if (redisHost && redisPort) {
    options.socket = {
      host: redisHost,
      port: Number(redisPort)
    };
  }

  client = createClient(options);
  client.on('error', err => console.error('Redis Client Error', err));
  client.connect().catch(err => console.error('Redis connection error', err));
  return client;
}

module.exports = { getClient };
