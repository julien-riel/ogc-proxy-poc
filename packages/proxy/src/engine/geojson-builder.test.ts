import { describe, it, expect } from 'vitest';
import { buildFeature, buildFeatureCollection } from './geojson-builder.js';
import type { CollectionConfig } from './types.js';

const pointConfig: CollectionConfig = {
  title: 'Test Points',
  upstream: { baseUrl: '', method: 'GET', responseMapping: { items: '', total: '', item: '' } },
  geometry: { type: 'Point', xField: 'x', yField: 'y' },
  idField: 'id',
  properties: [{ name: 'etat', type: 'string' }],
};

const lineConfig: CollectionConfig = {
  title: 'Test Lines',
  upstream: { baseUrl: '', method: 'GET', responseMapping: { items: '', total: '', item: '' } },
  geometry: { type: 'LineString', coordsField: 'geometry.coords' },
  idField: 'id',
  properties: [{ name: 'nom', type: 'string' }],
};

const polygonConfig: CollectionConfig = {
  title: 'Test Polygons',
  upstream: { baseUrl: '', method: 'GET', responseMapping: { items: '', total: '', item: '' } },
  geometry: { type: 'Polygon', wktField: 'wkt' },
  idField: 'code',
  properties: [{ name: 'nom', type: 'string' }],
};

describe('GeoJSON Builder', () => {
  describe('buildFeature', () => {
    it('builds a Point feature from x/y fields', () => {
      const raw = { id: 1, x: -73.56, y: 45.50, etat: 'actif' };
      const feature = buildFeature(raw, pointConfig);
      expect(feature.type).toBe('Feature');
      expect(feature.id).toBe(1);
      expect(feature.geometry).toEqual({ type: 'Point', coordinates: [-73.56, 45.50] });
      expect(feature.properties).toEqual({ etat: 'actif' });
    });

    it('builds a LineString feature from coords field', () => {
      const raw = { id: 2, geometry: { coords: [[-73.5, 45.5], [-73.6, 45.6]] }, nom: 'Test' };
      const feature = buildFeature(raw, lineConfig);
      expect(feature.geometry).toEqual({ type: 'LineString', coordinates: [[-73.5, 45.5], [-73.6, 45.6]] });
      expect(feature.properties).toEqual({ nom: 'Test' });
    });

    it('builds a Polygon feature from WKT', () => {
      const raw = { code: 'VM', nom: 'Ville-Marie', wkt: 'POLYGON((-73.59 45.49, -73.55 45.49, -73.55 45.52, -73.59 45.52, -73.59 45.49))' };
      const feature = buildFeature(raw, polygonConfig);
      expect(feature.id).toBe('VM');
      expect(feature.geometry.type).toBe('Polygon');
      expect((feature.geometry as any).coordinates[0]).toHaveLength(5);
      expect(feature.properties).toEqual({ nom: 'Ville-Marie' });
    });

    it('only includes declared properties', () => {
      const raw = { id: 1, x: -73.5, y: 45.5, etat: 'actif', secret: 'hidden' };
      const feature = buildFeature(raw, pointConfig);
      expect(feature.properties).toEqual({ etat: 'actif' });
      expect(feature.properties).not.toHaveProperty('secret');
    });
  });

  describe('buildFeatureCollection', () => {
    it('builds a FeatureCollection with links and counts', () => {
      const items = [
        { id: 1, x: -73.5, y: 45.5, etat: 'actif' },
        { id: 2, x: -73.6, y: 45.6, etat: 'inactif' },
      ];
      const fc = buildFeatureCollection(items, pointConfig, {
        baseUrl: 'http://localhost:3000/ogc',
        collectionId: 'test',
        offset: 0,
        limit: 10,
        total: 2,
      });
      expect(fc.type).toBe('FeatureCollection');
      expect(fc.features).toHaveLength(2);
      expect(fc.numberReturned).toBe(2);
      expect(fc.numberMatched).toBe(2);
    });

    it('includes next link when more items exist', () => {
      const items = [{ id: 1, x: -73.5, y: 45.5, etat: 'actif' }];
      const fc = buildFeatureCollection(items, pointConfig, {
        baseUrl: 'http://localhost:3000/ogc',
        collectionId: 'test',
        offset: 0,
        limit: 1,
        total: 5,
      });
      const nextLink = fc.links.find((l: any) => l.rel === 'next');
      expect(nextLink).toBeDefined();
      expect(nextLink!.href).toContain('offset=1');
      expect(nextLink!.href).toContain('limit=1');
    });

    it('omits next link on last page', () => {
      const items = [{ id: 1, x: -73.5, y: 45.5, etat: 'actif' }];
      const fc = buildFeatureCollection(items, pointConfig, {
        baseUrl: 'http://localhost:3000/ogc',
        collectionId: 'test',
        offset: 4,
        limit: 1,
        total: 5,
      });
      const nextLink = fc.links.find((l: any) => l.rel === 'next');
      expect(nextLink).toBeUndefined();
    });

    it('omits numberMatched when total is undefined', () => {
      const items = [{ id: 1, x: -73.5, y: 45.5, etat: 'actif' }];
      const fc = buildFeatureCollection(items, pointConfig, {
        baseUrl: 'http://localhost:3000/ogc',
        collectionId: 'test',
        offset: 0,
        limit: 10,
        total: undefined,
      });
      expect(fc.numberMatched).toBeUndefined();
      expect(fc.numberReturned).toBe(1);
    });
  });
});
