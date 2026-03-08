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

  const app = express();
  app.set('redis', redis);
  app.set('redisKeyPrefix', getKeyPrefix());
  app.set('cache', cache);
  app.use(helmet());
  const corsOrigin = process.env.CORS_ORIGIN;
  app.use(cors(corsOrigin ? { origin: corsOrigin.split(',') } : undefined));
  app.use(express.json({ limit: '100kb' }));

  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 'TooManyRequests', description: 'Rate limit exceeded' },
    ...(redis
      ? {
          store: new RedisStore({
            sendCommand: (...args: string[]) => redis.call(...args) as any,
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
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', (_req, res) => {
    try {
      const reg = getRegistry();
      const hasCollections = Object.keys(reg.collections).length > 0;
      const redisStatus = getRedisStatus(redis);
      if (hasCollections) {
        return res.json({
          status: 'ready',
          collections: Object.keys(reg.collections).length,
          redis: redisStatus,
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
