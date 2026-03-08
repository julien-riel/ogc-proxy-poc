import { describe, it, expect } from 'vitest';
import { parseCql2 } from './parser.js';
import { evaluateFilter } from './evaluator.js';
import type { Feature } from 'geojson';

const feature: Feature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [0, 0] },
  properties: { created: '2025-06-15T10:00:00Z', name: 'test' },
};

describe('CQL2 Temporal Predicates', () => {
  it('T_BEFORE: property before a timestamp', () => {
    const node = parseCql2("created T_BEFORE '2025-07-01T00:00:00Z'");
    expect(evaluateFilter(node, feature)).toBe(true);
  });

  it('T_BEFORE: property not before a timestamp', () => {
    const node = parseCql2("created T_BEFORE '2025-01-01T00:00:00Z'");
    expect(evaluateFilter(node, feature)).toBe(false);
  });

  it('T_AFTER: property after a timestamp', () => {
    const node = parseCql2("created T_AFTER '2025-01-01T00:00:00Z'");
    expect(evaluateFilter(node, feature)).toBe(true);
  });

  it('T_AFTER: property not after a timestamp', () => {
    const node = parseCql2("created T_AFTER '2026-01-01T00:00:00Z'");
    expect(evaluateFilter(node, feature)).toBe(false);
  });

  it('T_DURING: property during a period', () => {
    const node = parseCql2("created T_DURING '2025-01-01T00:00:00Z' '2025-12-31T23:59:59Z'");
    expect(evaluateFilter(node, feature)).toBe(true);
  });

  it('T_DURING: property outside a period', () => {
    const node = parseCql2("created T_DURING '2024-01-01T00:00:00Z' '2024-12-31T23:59:59Z'");
    expect(evaluateFilter(node, feature)).toBe(false);
  });

  it('works with date-only strings', () => {
    const node = parseCql2("created T_AFTER '2025-01-01'");
    expect(evaluateFilter(node, feature)).toBe(true);
  });

  it('combines with AND', () => {
    const node = parseCql2("created T_AFTER '2025-01-01T00:00:00Z' AND name = 'test'");
    expect(evaluateFilter(node, feature)).toBe(true);
  });

  it('returns false when property value is null', () => {
    const nullFeature: Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { created: null },
    };
    const node = parseCql2("created T_AFTER '2025-01-01T00:00:00Z'");
    expect(evaluateFilter(node, nullFeature)).toBe(false);
  });

  it('returns false when property value is not a valid date', () => {
    const badFeature: Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { created: 'not-a-date' },
    };
    const node = parseCql2("created T_BEFORE '2025-07-01T00:00:00Z'");
    expect(evaluateFilter(node, badFeature)).toBe(false);
  });

  it('throws on invalid target date', () => {
    const node = parseCql2("created T_BEFORE 'not-a-date'");
    expect(() => evaluateFilter(node, feature)).toThrow('Invalid temporal filter');
  });

  it('T_DURING boundary: matches when property equals start date', () => {
    const boundaryFeature: Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { created: '2025-01-01T00:00:00Z' },
    };
    const node = parseCql2("created T_DURING '2025-01-01T00:00:00Z' '2025-12-31T23:59:59Z'");
    expect(evaluateFilter(node, boundaryFeature)).toBe(true);
  });

  it('T_DURING boundary: matches when property equals end date', () => {
    const boundaryFeature: Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { created: '2025-12-31T23:59:59Z' },
    };
    const node = parseCql2("created T_DURING '2025-01-01T00:00:00Z' '2025-12-31T23:59:59Z'");
    expect(evaluateFilter(node, boundaryFeature)).toBe(true);
  });
});
