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
      const ast = parseCql2(
        'S_INTERSECTS(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))'
      );
      expect(evaluateFilter(ast, makePoint(-73.5, 45.5))).toBe(true);
    });

    it('rejects a point outside a polygon', () => {
      const ast = parseCql2(
        'S_INTERSECTS(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))'
      );
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
});
