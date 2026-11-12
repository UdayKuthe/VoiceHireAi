import Redis from 'ioredis';
import { env } from './env.js';

let redisClient = null;

export const getRedisClient = () => {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      }
    });

    redisClient.on('error', (err) => {
      console.error(`[Redis] Client error: ${err.message}`);
    });
  }
  return redisClient;
};

export const closeRedisClient = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (_) {
      try {
        redisClient.disconnect();
      } catch (__) {}
    }
    redisClient = null;
  }
};

export default getRedisClient;

