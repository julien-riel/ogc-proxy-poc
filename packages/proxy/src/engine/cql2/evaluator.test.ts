import { describe, it, expect } from 'vitest';
import { evaluateFilter } from './evaluator.js';
import { parseCql2 } from './parser.js';
import type { Feature, Point } from 'geojson';

function makePoint(lon: number, lat: number, props: Record<string, unknown> = {}): Feature<Point> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: props,
  };
}

describe('CQL2 Evaluator', () => {
  describe('Comparison operators', () => {
    it('evaluates = on string', () => {
      const ast = parseCql2("etat='actif'");
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif' }))).toBe(true);
    });

    it('evaluates = on string (no match)', () => {
      const ast = parseCql2("etat='actif'");
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'inactif' }))).toBe(false);
    });

    it('evaluates > on number', () => {
      const ast = parseCql2('population>50000');
      expect(evaluateFilter(ast, makePoint(0, 0, { population: 100000 }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { population: 30000 }))).toBe(false);
    });

    it('evaluates <> (not equal)', () => {
      const ast = parseCql2("etat<>'inactif'");
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif' }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'inactif' }))).toBe(false);
    });
  });

  describe('Logical operators', () => {
    it('evaluates AND', () => {
      const ast = parseCql2("etat='actif' AND population>50000");
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif', population: 100000 }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif', population: 30000 }))).toBe(false);
    });

    it('evaluates OR', () => {
      const ast = parseCql2("etat='actif' OR etat='maintenance'");
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'maintenance' }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'inactif' }))).toBe(false);
    });

    it('evaluates NOT', () => {
      const ast = parseCql2("NOT etat='inactif'");
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif' }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'inactif' }))).toBe(false);
    });
  });

  describe('LIKE', () => {
    it('matches with % wildcard', () => {
      const ast = parseCql2("nom LIKE 'Rose%'");
      expect(evaluateFilter(ast, makePoint(0, 0, { nom: 'Rosemont-La Petite-Patrie' }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { nom: 'Verdun' }))).toBe(false);
    });
  });

  describe('Spatial — S_INTERSECTS', () => {
    it('matches a point inside a polygon', () => {
      const ast = parseCql2('S_INTERSECTS(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
      expect(evaluateFilter(ast, makePoint(-73.5, 45.5))).toBe(true);
    });

    it('rejects a point outside a polygon', () => {
      const ast = parseCql2('S_INTERSECTS(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
      expect(evaluateFilter(ast, makePoint(-75, 45.5))).toBe(false);
    });
  });

  describe('Spatial — S_DWITHIN', () => {
    it('matches a point within distance', () => {
      const ast = parseCql2('S_DWITHIN(geometry,POINT(-73.5 45.5),50000,meters)');
      expect(evaluateFilter(ast, makePoint(-73.55, 45.52))).toBe(true);
    });

    it('rejects a point beyond distance', () => {
      const ast = parseCql2('S_DWITHIN(geometry,POINT(-73.5 45.5),1,meters)');
      expect(evaluateFilter(ast, makePoint(-75, 47))).toBe(false);
    });
  });

  describe('Spatial — S_WITHIN', () => {
    it('matches point within polygon', () => {
      const ast = parseCql2('S_WITHIN(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
      expect(evaluateFilter(ast, makePoint(-73.5, 45.5))).toBe(true);
    });

    it('rejects point outside polygon', () => {
      const ast = parseCql2('S_WITHIN(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
      expect(evaluateFilter(ast, makePoint(-75, 45.5))).toBe(false);
    });
  });

  describe('Spatial — S_CONTAINS', () => {
    it('polygon contains a point', () => {
      const polygon: Feature = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-74, 45],
              [-73, 45],
              [-73, 46],
              [-74, 46],
              [-74, 45],
            ],
          ],
        },
        properties: {},
      };
      const ast = parseCql2('S_CONTAINS(geometry,POINT(-73.5 45.5))');
      expect(evaluateFilter(ast, polygon)).toBe(true);
    });
  });

  describe('Spatial — S_DISJOINT', () => {
    it('matches disjoint geometries', () => {
      const ast = parseCql2('S_DISJOINT(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
      expect(evaluateFilter(ast, makePoint(-80, 50))).toBe(true);
    });

    it('rejects overlapping geometries', () => {
      const ast = parseCql2('S_DISJOINT(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
      expect(evaluateFilter(ast, makePoint(-73.5, 45.5))).toBe(false);
    });
  });

  describe('Spatial — S_TOUCHES', () => {
    it('matches point on polygon boundary', () => {
      const ast = parseCql2('S_TOUCHES(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
      expect(evaluateFilter(ast, makePoint(-74, 45.5))).toBe(true);
    });
  });

  describe('Spatial — S_EQUALS', () => {
    it('matches identical point geometries', () => {
      const ast = parseCql2('S_EQUALS(geometry,POINT(-73.5 45.5))');
      expect(evaluateFilter(ast, makePoint(-73.5, 45.5))).toBe(true);
    });

    it('rejects different point geometries', () => {
      const ast = parseCql2('S_EQUALS(geometry,POINT(-73.5 45.5))');
      expect(evaluateFilter(ast, makePoint(-73.6, 45.5))).toBe(false);
    });
  });

  describe('Spatial — null geometry', () => {
    it('returns false when feature has no geometry', () => {
      const ast = parseCql2('S_INTERSECTS(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
      const noGeom: Feature = { type: 'Feature', geometry: null as any, properties: {} };
      expect(evaluateFilter(ast, noGeom)).toBe(false);
    });
  });

  describe('IN operator', () => {
    it('matches value in list', () => {
      const ast = parseCql2("etat IN ('actif','maintenance')");
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif' }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'maintenance' }))).toBe(true);
    });

    it('rejects value not in list', () => {
      const ast = parseCql2("etat IN ('actif','maintenance')");
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'inactif' }))).toBe(false);
    });
  });

  describe('BETWEEN operator', () => {
    it('matches value in range', () => {
      const ast = parseCql2('population BETWEEN 10000 AND 50000');
      expect(evaluateFilter(ast, makePoint(0, 0, { population: 25000 }))).toBe(true);
    });

    it('rejects value outside range', () => {
      const ast = parseCql2('population BETWEEN 10000 AND 50000');
      expect(evaluateFilter(ast, makePoint(0, 0, { population: 5000 }))).toBe(false);
    });

    it('includes boundary values', () => {
      const ast = parseCql2('population BETWEEN 10000 AND 50000');
      expect(evaluateFilter(ast, makePoint(0, 0, { population: 10000 }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { population: 50000 }))).toBe(true);
    });
  });

  describe('IS NULL / IS NOT NULL', () => {
    it('matches null property', () => {
      const ast = parseCql2('etat IS NULL');
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: null }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, {}))).toBe(true);
    });

    it('rejects non-null for IS NULL', () => {
      const ast = parseCql2('etat IS NULL');
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif' }))).toBe(false);
    });

    it('matches non-null for IS NOT NULL', () => {
      const ast = parseCql2('etat IS NOT NULL');
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif' }))).toBe(true);
    });

    it('rejects null for IS NOT NULL', () => {
      const ast = parseCql2('etat IS NOT NULL');
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: null }))).toBe(false);
    });
  });

  describe('Temporal operators', () => {
    it('T_BEFORE matches earlier date', () => {
      const ast = parseCql2("date_inspection T_BEFORE '2024-01-01'");
      expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: '2023-06-15' }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: '2024-06-15' }))).toBe(false);
    });

    it('T_AFTER matches later date', () => {
      const ast = parseCql2("date_inspection T_AFTER '2024-01-01'");
      expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: '2024-06-15' }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: '2023-06-15' }))).toBe(false);
    });

    it('T_DURING matches date within range', () => {
      const ast = parseCql2("date_inspection T_DURING '2024-01-01' '2024-12-31'");
      expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: '2024-06-15' }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: '2023-06-15' }))).toBe(false);
    });

    it('returns false for null temporal property', () => {
      const ast = parseCql2("date_inspection T_BEFORE '2024-01-01'");
      expect(evaluateFilter(ast, makePoint(0, 0, {}))).toBe(false);
    });

    it('returns false for invalid date in property', () => {
      const ast = parseCql2("date_inspection T_BEFORE '2024-01-01'");
      expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: 'not-a-date' }))).toBe(false);
    });
  });

  describe('S_DWITHIN edge cases', () => {
    it('converts kilometers correctly', () => {
      const ast = parseCql2('S_DWITHIN(geometry,POINT(-73.5 45.5),50,kilometers)');
      expect(evaluateFilter(ast, makePoint(-73.55, 45.52))).toBe(true);
    });

    it('returns false for non-point feature geometry', () => {
      const ast = parseCql2('S_DWITHIN(geometry,POINT(-73.5 45.5),50000,meters)');
      const polygon: Feature = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-74, 45],
              [-73, 45],
              [-73, 46],
              [-74, 46],
              [-74, 45],
            ],
          ],
        },
        properties: {},
      };
      expect(evaluateFilter(ast, polygon)).toBe(false);
    });
  });
});
