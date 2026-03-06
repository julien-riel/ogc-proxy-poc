import { Router } from 'express';
import { bornesFontaines } from '../data/bornes-fontaines.js';

const router = Router();

router.get('/', (req, res) => {
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = parseInt(req.query.limit as string) || 10;

  let filtered = bornesFontaines;

  // Attribute filters
  const { etat, arrondissement } = req.query;
  if (etat) filtered = filtered.filter(b => b.etat === etat);
  if (arrondissement) filtered = filtered.filter(b => b.arrondissement === arrondissement);

  // Bbox filter: bbox=minLon,minLat,maxLon,maxLat
  const bboxStr = req.query.bbox as string | undefined;
  if (bboxStr) {
    const [minLon, minLat, maxLon, maxLat] = bboxStr.split(',').map(Number);
    filtered = filtered.filter(b =>
      b.x >= minLon && b.x <= maxLon && b.y >= minLat && b.y <= maxLat
    );
  }

  // Sort support: sort_by=field or sort_by=-field
  const sortBy = req.query.sort_by as string | undefined;
  if (sortBy) {
    const desc = sortBy.startsWith('-');
    const field = desc ? sortBy.slice(1) : sortBy;
    filtered = [...filtered].sort((a, b) => {
      const va = (a as any)[field];
      const vb = (b as any)[field];
      if (va < vb) return desc ? 1 : -1;
      if (va > vb) return desc ? -1 : 1;
      return 0;
    });
  }

  const page = filtered.slice(offset, offset + limit);
  res.json({ data: page, total: filtered.length });
});

router.get('/:id', (req, res) => {
  const item = bornesFontaines.find(b => b.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ data: item });
});

export default router;
