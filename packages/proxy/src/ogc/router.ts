import { Router } from 'express';
import { landing } from './landing.js';
import { conformance } from './conformance.js';
import { listCollections, getCollectionById } from './collections.js';
import { getItems, getItem } from './items.js';

const router = Router();

router.get('/', landing);
router.get('/conformance', conformance);
router.get('/collections', listCollections);
router.get('/collections/:collectionId', getCollectionById);
router.get('/collections/:collectionId/items', getItems);
router.get('/collections/:collectionId/items/:featureId', getItem);

export default router;
