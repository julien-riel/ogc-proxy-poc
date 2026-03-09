import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createOgcRouter } from './ogc/router.js';
import { createWfsRouter } from './wfs/router.js';
import { createAdminRouter } from './admin/router.js';
import { loadRegistry, getRegistry } from './engine/registry.js';
import { createJwtMiddleware } from './auth/jwt.js';
import { initLogging, logger, createCorrelationIdMiddleware } from './logger.js';
import { createRedisClient, getRedisStatus, getKeyPrefix } from './redis.js';
import { CacheService } from './engine/cache.js';
import { HealthChecker } from './engine/health-check.js';
import { httpMiddleware, metricsHandler, rateLimitRejectionsTotal, safeMetric } from './metrics.js';
import { httpsRedirect } from './middleware/https-redirect.js';

export async function createApp() {
  initLogging();
  const log = logger.app();

  loadRegistry();

  const redis = createRedisClient();
  if (redis) {
    try {
      await redis.connect();
    } catch (err) {
      log.warning({ err }, 'Redis connection failed, falling back to in-memory');
    }
  }

  const jwtMiddleware = await createJwtMiddleware(getRegistry().security?.jwt);

  const cache = new CacheService(redis, getKeyPrefix());

  const healthChecker = new HealthChecker();
  const healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '30000');
  if (healthCheckInterval > 0) {
    healthChecker.startPeriodic(getRegistry().collections, healthCheckInterval);
  }

  const app = express();
  app.set('redis', redis);
  app.set('redisKeyPrefix', getKeyPrefix());
  app.set('cache', cache);
  app.set('healthChecker', healthChecker);
  app.use(helmet());
  if (process.env.ENFORCE_HTTPS === 'true') {
    app.use(httpsRedirect());
  }
  app.use(httpMiddleware);
  const corsOrigin = process.env.CORS_ORIGIN;
  app.use(cors(corsOrigin ? { origin: corsOrigin.split(',') } : undefined));
  app.use(express.json({ limit: '100kb' }));

  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 'TooManyRequests', description: 'Rate limit exceeded' },
    handler: (_req, res) => {
      safeMetric(() => rateLimitRejectionsTotal.inc({ collection: 'global', limiter: 'client' }));
      res.status(429).json({ code: 'TooManyRequests', description: 'Rate limit exceeded' });
    },
    ...(redis
      ? {
          store: new RedisStore({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sendCommand: (...args: string[]) => (redis as any).call(...args),
            prefix: `${getKeyPrefix()}rl:client:`,
          }),
        }
      : {}),
  });
  app.use(limiter);

  app.use(createCorrelationIdMiddleware());
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      log.info(
        {
          method: req.method,
          path: req.path,
          query: req.query,
          status: res.statusCode,
          durationMs: Date.now() - start,
        },
        `${req.method} ${req.path} ${res.statusCode}`,
      );
    });
    next();
  });
  app.use('/ogc', createOgcRouter(jwtMiddleware));
  app.use('/wfs', createWfsRouter(jwtMiddleware));
  app.use('/admin', createAdminRouter(jwtMiddleware, cache));
  app.get('/health', (_req, res) => {
    const statuses = healthChecker.getAllStatuses();
    res.json({ status: 'ok', upstreams: statuses });
  });
  app.get('/metrics', metricsHandler);
  app.get('/ready', (_req, res) => {
    try {
      const reg = getRegistry();
      const hasCollections = Object.keys(reg.collections).length > 0;
      const redisStatus = getRedisStatus(redis);
      const upstreams = healthChecker.getAllStatuses();
      const hasUnhealthy = Object.values(upstreams).some((s) => s === 'unhealthy');
      if (hasCollections) {
        return res.json({
          status: hasUnhealthy ? 'degraded' : 'ready',
          collections: Object.keys(reg.collections).length,
          redis: redisStatus,
          upstreams,
        });
      }
      return res.status(503).json({ status: 'not ready', reason: 'no collections loaded' });
    } catch (err) {
      log.error({ err }, 'readiness check failed');
      return res.status(503).json({ status: 'not ready', reason: 'registry not loaded' });
    }
  });
  return app;
}
