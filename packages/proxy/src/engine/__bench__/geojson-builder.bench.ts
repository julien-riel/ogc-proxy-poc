import { bench, describe } from 'vitest';
import { buildFeature, buildFeatureCollection } from '../geojson-builder.js';
import type { CollectionConfig } from '../types.js';

const mockConfig: CollectionConfig = {
  title: 'bench',
  idField: 'id',
  geometry: { type: 'Point', xField: 'lon', yField: 'lat' },
  properties: [
    { name: 'name', type: 'string' },
    { name: 'value', type: 'number' },
  ],
  upstream: {
    baseUrl: 'http://localhost',
    method: 'GET',
    pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
    responseMapping: { items: 'data', total: 'total', item: 'data' },
  },
};

/**
 * Generates an array of raw items for benchmarking.
 */
function generateRawItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    lon: -73.5 + Math.random() * 0.5,
    lat: 45.4 + Math.random() * 0.3,
    name: `Feature ${i}`,
    value: Math.random() * 1000,
  }));
}

describe('GeoJSON Builder', () => {
  const items10k = generateRawItems(10_000);

  bench('buildFeature x 10,000', () => {
    for (const item of items10k) {
      buildFeature(item, mockConfig);
    }
  });

  bench('buildFeatureCollection with 10,000 features', () => {
    const features = items10k.map((item) => buildFeature(item, mockConfig));
    buildFeatureCollection(features, {
      baseUrl: 'http://localhost',
      collectionId: 'bench',
      offset: 0,
      limit: 10000,
      total: 10000,
    });
  });
});
