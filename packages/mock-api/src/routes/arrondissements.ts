import { Router } from 'express';
import { arrondissements } from '../data/arrondissements.js';

const router = Router();

router.get('/', (req, res) => {
  const cursor = req.query.cursor as string | undefined;
  const limit = parseInt(req.query.limit as string) || 10;

  let startIndex = 0;
  if (cursor) {
    const cursorIndex = arrondissements.findIndex(a => a.code === cursor);
    startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  }

  const items = arrondissements.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < arrondissements.length;
  const nextCursor = hasMore ? items[items.length - 1].code : null;

  res.json({ items, nextCursor });
});

router.get('/:code', (req, res) => {
  const item = arrondissements.find(a => a.code === req.params.code);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ item });
});

export default router;
