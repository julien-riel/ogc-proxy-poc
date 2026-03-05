import express from 'express';
import cors from 'cors';
import ogcRouter from './ogc/router.js';
import { loadRegistry } from './engine/registry.js';

export function createApp() {
  loadRegistry();

  const app = express();
  app.use(cors());
  app.use('/ogc', ogcRouter);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
