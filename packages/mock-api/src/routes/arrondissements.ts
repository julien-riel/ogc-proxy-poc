import { Router } from 'express';
import { arrondissements } from '../data/arrondissements.js';

const router = Router();

router.get('/', (req, res) => {
  const cursor = req.query.cursor as string | undefined;
  const limit = parseInt(req.query.limit as string) || 10;

  let filtered = arrondissements;

  // Attribute filters
  const { nom } = req.query;
  if (nom) filtered = filtered.filter((a) => a.nom === nom);

  let startIndex = 0;
  if (cursor) {
    const cursorIndex = filtered.findIndex((a) => a.code === cursor);
    startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  }

  const items = filtered.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < filtered.length;
  const nextCursor = hasMore ? items[items.length - 1].code : null;

  res.json({ items, nextCursor });
});

router.get('/:code', (req, res) => {
  const item = arrondissements.find((a) => a.code === req.params.code);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ item });
});

export default router;
