import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createOgcRouter } from './ogc/router.js';
import { createWfsRouter } from './wfs/router.js';
import { loadRegistry, getRegistry } from './engine/registry.js';
import { createJwtMiddleware } from './auth/jwt.js';
import { initLogging, logger, createCorrelationIdMiddleware } from './logger.js';

export async function createApp() {
  initLogging();
  const log = logger.app();

  loadRegistry();

  const jwtMiddleware = await createJwtMiddleware(getRegistry().security?.jwt);

  const app = express();
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
  });
  app.use(limiter);

  app.use(createCorrelationIdMiddleware());
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      log.info({
        method: req.method,
        path: req.path,
        query: req.query,
        status: res.statusCode,
        durationMs: Date.now() - start,
      }, `${req.method} ${req.path} ${res.statusCode}`);
    });
    next();
  });
  app.use('/ogc', createOgcRouter(jwtMiddleware));
  app.use('/wfs', createWfsRouter(jwtMiddleware));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
