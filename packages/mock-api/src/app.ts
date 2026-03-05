import express from 'express';
import bornesRouter from './routes/bornes.js';
import pistesRouter from './routes/pistes.js';
import arrondissementsRouter from './routes/arrondissements.js';

export function createApp() {
  const app = express();
  app.use('/api/bornes-fontaines', bornesRouter);
  app.use('/api/pistes-cyclables', pistesRouter);
  app.use('/api/arrondissements', arrondissementsRouter);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
