import { createLogger, initLogger, LoggerConfigs, LogLevel } from '@villedemontreal/logger';
import { correlationIdService, createCorrelationIdMiddleware, init as initCorrelationId } from '@villedemontreal/correlation-id';

let initialized = false;

/**
 * Initialize the structured logging system with correlation ID support.
 * Must be called before any logger is created.
 */
export function initLogging(): void {
  if (initialized) return;

  const config = new LoggerConfigs(() => {
    try {
      return correlationIdService.getId();
    } catch {
      return 'no-correlation-id';
    }
  });

  const level = process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO;
  config.setLogLevel(level);
  config.setLogHumanReadableinConsole(process.env.NODE_ENV !== 'production');

  initLogger(config);
  initCorrelationId(createLogger);
  initialized = true;
}

export const logger = {
  app: () => createLogger('app'),
  adapter: () => createLogger('adapter'),
  items: () => createLogger('items'),
  wfs: () => createLogger('wfs'),
  registry: () => createLogger('registry'),
};

export { createCorrelationIdMiddleware };
