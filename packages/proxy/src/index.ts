import { createApp } from './app.js';
import { initLogging, logger } from './logger.js';
import type { RedisClient } from './redis.js';

const PORT = process.env.PORT || 3000;
const SHUTDOWN_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 60_000;

initLogging();
const log = logger.app();

const app = await createApp();
const redis = app.get('redis') as RedisClient;
const server = app.listen(PORT, () => {
  log.info(`OGC Proxy running on port ${PORT}`);
});

server.setTimeout(REQUEST_TIMEOUT_MS);
server.on('timeout', (socket) => {
  log.warning({ timeoutMs: REQUEST_TIMEOUT_MS }, 'request timeout, destroying socket');
  socket.destroy();
});

function shutdown(signal: string) {
  log.info(`${signal} received, starting graceful shutdown`);

  server.close(async () => {
    if (redis) {
      await redis.quit();
      log.info('Redis connection closed');
    }
    log.info('All connections drained, exiting');
    process.exit(0);
  });

  setTimeout(() => {
    log.warning('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
