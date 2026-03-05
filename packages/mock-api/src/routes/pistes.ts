import { Router } from 'express';
import { pistesCyclables } from '../data/pistes-cyclables.js';

const router = Router();

router.get('/', (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;
  const start = (page - 1) * pageSize;
  const items = pistesCyclables.slice(start, start + pageSize);
  res.json({
    results: items,
    count: pistesCyclables.length,
    page,
    totalPages: Math.ceil(pistesCyclables.length / pageSize),
  });
});

router.get('/:id', (req, res) => {
  const item = pistesCyclables.find(p => p.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ result: item });
});

export default router;
