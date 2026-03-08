import Redis from 'ioredis';
import { logger } from './logger.js';

export type RedisClient = Redis | null;

/**
 * Create a Redis client from the REDIS_URL environment variable.
 * Returns null when REDIS_URL is not set, enabling graceful degradation.
 */
export function createRedisClient(): RedisClient {
  const url = process.env.REDIS_URL;
  if (!url) {
    return null;
  }

  const log = logger.app();
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      log.info({ attempt: times, delayMs: delay }, 'Redis reconnecting');
      return delay;
    },
    lazyConnect: true,
  });

  client.on('error', (err) => {
    log.error({ err }, 'Redis connection error');
  });

  client.on('connect', () => {
    log.info('Redis connected');
  });

  return client;
}

/**
 * Get the current connection status of a Redis client.
 * Returns 'disconnected' when the client is null.
 */
export function getRedisStatus(client: RedisClient): string {
  if (!client) return 'disconnected';
  return client.status;
}

/**
 * Get the key prefix for Redis keys, configurable via REDIS_KEY_PREFIX env var.
 */
export function getKeyPrefix(): string {
  return process.env.REDIS_KEY_PREFIX || 'ogc:';
}
