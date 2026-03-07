import { describe, it, expect } from 'vitest';
import { parseBbox, isInBbox, buildUpstreamFilters, buildPostFetchSimpleFilters, applyPostFilters } from './items.js';
import type { PropertyConfig } from '../engine/types.js';

describe('parseBbox', () => {
  it('parses valid bbox string', () => {
    expect(parseBbox('-73.9,45.4,-73.5,45.7')).toEqual([-73.9, 45.4, -73.5, 45.7]);
  });

  it('returns undefined for invalid bbox', () => {
    expect(parseBbox('invalid')).toBeUndefined();
  });

  it('returns undefined for incomplete bbox', () => {
    expect(parseBbox('1,2,3')).toBeUndefined();
  });
});

describe('isInBbox', () => {
  const bbox: [number, number, number, number] = [-74, 45, -73, 46];

  it('returns true for point inside bbox', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-73.5, 45.5] },
      properties: {},
    };
    expect(isInBbox(feature, bbox)).toBe(true);
  });

  it('returns false for point outside bbox', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-72, 44] },
      properties: {},
    };
    expect(isInBbox(feature, bbox)).toBe(false);
  });

  it('returns false for null geometry', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: null as any,
      properties: {},
    };
    expect(isInBbox(feature, bbox)).toBe(false);
  });
});

describe('buildUpstreamFilters', () => {
  const properties: PropertyConfig[] = [
    { name: 'etat', type: 'string', filterable: true, upstream: { param: 'etat', operators: ['='] } },
    { name: 'nom', type: 'string', filterable: true },
    { name: 'id', type: 'int' },
  ];

  it('maps filterable properties with upstream param', () => {
    expect(buildUpstreamFilters({ etat: 'actif' }, properties)).toEqual({ etat: 'actif' });
  });

  it('ignores properties without upstream param', () => {
    expect(buildUpstreamFilters({ nom: 'test' }, properties)).toEqual({});
  });

  it('ignores non-filterable properties', () => {
    expect(buildUpstreamFilters({ id: '1' }, properties)).toEqual({});
  });
});

describe('buildPostFetchSimpleFilters', () => {
  const properties: PropertyConfig[] = [
    { name: 'etat', type: 'string', filterable: true, upstream: { param: 'etat', operators: ['='] } },
    { name: 'nom', type: 'string', filterable: true },
  ];

  it('returns null when no post-fetch filters needed', () => {
    expect(buildPostFetchSimpleFilters({ etat: 'actif' }, properties)).toBeNull();
  });

  it('builds CQL2 AST for properties without upstream mapping', () => {
    const result = buildPostFetchSimpleFilters({ nom: 'test' }, properties);
    expect(result).toEqual({
      type: 'comparison',
      property: 'nom',
      operator: '=',
      value: 'test',
    });
  });

  it('converts numeric string values to numbers', () => {
    const result = buildPostFetchSimpleFilters({ nom: '42' }, properties);
    expect(result).not.toBeNull();
    expect((result as any).value).toBe(42);
  });
});

describe('applyPostFilters', () => {
  const features: GeoJSON.Feature[] = [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-73.5, 45.5] }, properties: { etat: 'actif' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-72, 44] }, properties: { etat: 'inactif' } },
  ];

  it('filters by bbox when not WFS', () => {
    const result = applyPostFilters(features, [-74, 45, -73, 46], null, null, false);
    expect(result).toHaveLength(1);
  });

  it('skips bbox filter for WFS', () => {
    const result = applyPostFilters(features, [-74, 45, -73, 46], null, null, true);
    expect(result).toHaveLength(2);
  });

  it('applies CQL2 filter', () => {
    const ast = { type: 'comparison' as const, property: 'etat', operator: '=' as const, value: 'actif' };
    const result = applyPostFilters(features, undefined, ast, null, false);
    expect(result).toHaveLength(1);
    expect(result[0].properties?.etat).toBe('actif');
  });

  it('returns all features when no filters', () => {
    const result = applyPostFilters(features, undefined, null, null, false);
    expect(result).toHaveLength(2);
  });
});
