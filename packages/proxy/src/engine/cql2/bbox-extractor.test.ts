import { describe, it, expect } from 'vitest';
import { extractBboxFromAst } from './bbox-extractor.js';
import { parseCql2 } from './parser.js';

describe('extractBboxFromAst', () => {
  it('extracts bbox from S_INTERSECTS with POLYGON', () => {
    const ast = parseCql2(
      'S_INTERSECTS(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))'
    );
    const bbox = extractBboxFromAst(ast);
    expect(bbox).toEqual([-74, 45, -73, 46]);
  });

  it('extracts bbox from S_WITHIN with POLYGON', () => {
    const ast = parseCql2(
      'S_WITHIN(geometry,POLYGON((-73.6 45.4,-73.5 45.4,-73.5 45.5,-73.6 45.5,-73.6 45.4)))'
    );
    const bbox = extractBboxFromAst(ast);
    expect(bbox).toEqual([-73.6, 45.4, -73.5, 45.5]);
  });

  it('extracts bbox from S_DWITHIN with POINT (buffer)', () => {
    const ast = parseCql2('S_DWITHIN(geometry,POINT(-73.5 45.5),1000,meters)');
    const bbox = extractBboxFromAst(ast);
    expect(bbox).toBeDefined();
    expect(bbox![0]).toBeLessThan(-73.5);
    expect(bbox![2]).toBeGreaterThan(-73.5);
  });

  it('returns null for non-spatial filter', () => {
    const ast = parseCql2("etat='actif'");
    expect(extractBboxFromAst(ast)).toBeNull();
  });

  it('extracts bbox from spatial inside AND', () => {
    const ast = parseCql2(
      "etat='actif' AND S_INTERSECTS(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))"
    );
    const bbox = extractBboxFromAst(ast);
    expect(bbox).toEqual([-74, 45, -73, 46]);
  });
});
