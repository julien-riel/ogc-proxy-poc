import express from 'express';
import cors from 'cors';
import { createOgcRouter } from './ogc/router.js';
import { createWfsRouter } from './wfs/router.js';
import { loadRegistry, getRegistry } from './engine/registry.js';
import { createJwtMiddleware } from './auth/jwt.js';

export async function createApp() {
  loadRegistry();

  const jwtMiddleware = await createJwtMiddleware(getRegistry().security?.jwt);

  const app = express();
  app.use(cors());
  app.use('/ogc', createOgcRouter(jwtMiddleware));
  app.use('/wfs', createWfsRouter(jwtMiddleware));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
