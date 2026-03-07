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
    const ast = parseCql2(
      'S_WITHIN(geometry,POLYGON((-73.6 45.4,-73.5 45.4,-73.5 45.5,-73.6 45.5,-73.6 45.4)))'
    );
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
