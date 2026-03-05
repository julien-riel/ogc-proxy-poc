import { Router } from 'express';
import { bornesFontaines } from '../data/bornes-fontaines.js';

const router = Router();

router.get('/', (req, res) => {
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = parseInt(req.query.limit as string) || 10;
  const page = bornesFontaines.slice(offset, offset + limit);
  res.json({ data: page, total: bornesFontaines.length });
});

router.get('/:id', (req, res) => {
  const item = bornesFontaines.find(b => b.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ data: item });
});

export default router;
