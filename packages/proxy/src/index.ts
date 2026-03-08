import { createApp } from './app.js';
import { initLogging, logger } from './logger.js';

const PORT = process.env.PORT || 3000;
const SHUTDOWN_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 60_000;

initLogging();
const log = logger.app();

const app = await createApp();
const server = app.listen(PORT, () => {
  log.info(`OGC Proxy running on port ${PORT}`);
});

server.setTimeout(REQUEST_TIMEOUT_MS);
server.on('timeout', (socket) => {
  socket.destroy();
});

function shutdown(signal: string) {
  log.info(`${signal} received, starting graceful shutdown`);

  server.close(() => {
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
