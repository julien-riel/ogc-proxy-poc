import express from 'express';
import cors from 'cors';
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
  app.use(cors());
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
