import { describe, it, expect } from 'vitest';
import { parseCql2 } from './parser.js';

describe('CQL2 Parser', () => {
  it('parses simple equality', () => {
    const ast = parseCql2("etat='actif'");
    expect(ast).toEqual({
      type: 'comparison',
      property: 'etat',
      operator: '=',
      value: 'actif',
    });
  });

  it('parses numeric comparison', () => {
    const ast = parseCql2('population>50000');
    expect(ast).toEqual({
      type: 'comparison',
      property: 'population',
      operator: '>',
      value: 50000,
    });
  });

  it('parses AND expression', () => {
    const ast = parseCql2("etat='actif' AND population>100");
    expect(ast.type).toBe('logical');
    if (ast.type === 'logical') {
      expect(ast.operator).toBe('AND');
      expect(ast.left.type).toBe('comparison');
      expect(ast.right.type).toBe('comparison');
    }
  });

  it('parses OR expression', () => {
    const ast = parseCql2("etat='actif' OR etat='maintenance'");
    expect(ast.type).toBe('logical');
    if (ast.type === 'logical') {
      expect(ast.operator).toBe('OR');
    }
  });

  it('parses NOT expression', () => {
    const ast = parseCql2("NOT etat='inactif'");
    expect(ast.type).toBe('not');
    if (ast.type === 'not') {
      expect(ast.operand.type).toBe('comparison');
    }
  });

  it('parses LIKE expression', () => {
    const ast = parseCql2("nom LIKE 'Rose%'");
    expect(ast).toEqual({
      type: 'like',
      property: 'nom',
      pattern: 'Rose%',
    });
  });

  it('parses S_INTERSECTS with POINT', () => {
    const ast = parseCql2('S_INTERSECTS(geometry,POINT(-73.5 45.5))');
    expect(ast.type).toBe('spatial');
    if (ast.type === 'spatial') {
      expect(ast.operator).toBe('S_INTERSECTS');
      expect(ast.property).toBe('geometry');
      expect(ast.geometry).toEqual({
        type: 'Point',
        coordinates: [-73.5, 45.5],
      });
    }
  });

  it('parses S_WITHIN with POLYGON', () => {
    const ast = parseCql2('S_WITHIN(geometry,POLYGON((-73.6 45.4,-73.5 45.4,-73.5 45.5,-73.6 45.5,-73.6 45.4)))');
    expect(ast.type).toBe('spatial');
    if (ast.type === 'spatial') {
      expect(ast.operator).toBe('S_WITHIN');
      expect(ast.geometry.type).toBe('Polygon');
    }
  });

  it('parses S_DWITHIN with distance', () => {
    const ast = parseCql2('S_DWITHIN(geometry,POINT(-73.5 45.5),1000,meters)');
    expect(ast.type).toBe('spatial');
    if (ast.type === 'spatial') {
      expect(ast.operator).toBe('S_DWITHIN');
      expect(ast.distance).toBe(1000);
      expect(ast.distanceUnits).toBe('meters');
    }
  });

  it('parses AND with three terms (left-associative)', () => {
    const ast = parseCql2("a='1' AND b='2' AND c='3'");
    expect(ast.type).toBe('logical');
    if (ast.type === 'logical') {
      expect(ast.left.type).toBe('logical');
      expect(ast.right.type).toBe('comparison');
    }
  });

  describe('IN operator', () => {
    it('parses single value', () => {
      const ast = parseCql2("etat IN ('actif')");
      expect(ast).toEqual({ type: 'in', property: 'etat', values: ['actif'] });
    });

    it('parses multiple string values', () => {
      const ast = parseCql2("etat IN ('actif','maintenance','inactif')");
      expect(ast).toEqual({ type: 'in', property: 'etat', values: ['actif', 'maintenance', 'inactif'] });
    });

    it('parses numeric values', () => {
      const ast = parseCql2('code IN (1,2,3)');
      expect(ast).toEqual({ type: 'in', property: 'code', values: [1, 2, 3] });
    });
  });

  describe('BETWEEN operator', () => {
    it('parses numeric range', () => {
      const ast = parseCql2('population BETWEEN 10000 AND 50000');
      expect(ast).toEqual({ type: 'between', property: 'population', low: 10000, high: 50000 });
    });
  });

  describe('IS NULL / IS NOT NULL', () => {
    it('parses IS NULL', () => {
      const ast = parseCql2('etat IS NULL');
      expect(ast).toEqual({ type: 'isNull', property: 'etat', negated: false });
    });

    it('parses IS NOT NULL', () => {
      const ast = parseCql2('etat IS NOT NULL');
      expect(ast).toEqual({ type: 'isNull', property: 'etat', negated: true });
    });
  });

  describe('Temporal predicates', () => {
    it('parses T_BEFORE', () => {
      const ast = parseCql2("date_inspection T_BEFORE '2024-01-01'");
      expect(ast).toEqual({ type: 'temporal', operator: 'T_BEFORE', property: 'date_inspection', value: '2024-01-01' });
    });

    it('parses T_AFTER', () => {
      const ast = parseCql2("date_inspection T_AFTER '2024-01-01'");
      expect(ast).toEqual({ type: 'temporal', operator: 'T_AFTER', property: 'date_inspection', value: '2024-01-01' });
    });

    it('parses T_DURING with two timestamps', () => {
      const ast = parseCql2("date_inspection T_DURING '2024-01-01' '2024-12-31'");
      expect(ast).toEqual({
        type: 'temporal',
        operator: 'T_DURING',
        property: 'date_inspection',
        value: '2024-01-01',
        value2: '2024-12-31',
      });
    });
  });

  describe('LINESTRING geometry', () => {
    it('parses S_INTERSECTS with LINESTRING', () => {
      const ast = parseCql2('S_INTERSECTS(geometry,LINESTRING(-74 45,-73 46,-72 45))');
      expect(ast).toEqual(
        expect.objectContaining({
          type: 'spatial',
          operator: 'S_INTERSECTS',
          geometry: {
            type: 'LineString',
            coordinates: [
              [-74, 45],
              [-73, 46],
              [-72, 45],
            ],
          },
        }),
      );
    });
  });

  describe('Error handling', () => {
    it('throws on unsupported geometry type', () => {
      expect(() => parseCql2('S_INTERSECTS(geometry,MULTIPOINT(0 0))')).toThrow();
    });

    it('throws on unexpected token', () => {
      expect(() => parseCql2("42='value'")).toThrow();
    });
  });

  describe('depth limit', () => {
    it('rejects deeply nested expressions', () => {
      let expr = 'a = 1';
      for (let i = 0; i < 25; i++) {
        expr = `(${expr}) AND (b = ${i})`;
      }
      expect(() => parseCql2(expr)).toThrow(/depth/i);
    });

    it('accepts expressions within depth limit', () => {
      let expr = 'a = 1';
      for (let i = 0; i < 5; i++) {
        expr = `(${expr}) AND (b = ${i})`;
      }
      expect(() => parseCql2(expr)).not.toThrow();
    });
  });
});
