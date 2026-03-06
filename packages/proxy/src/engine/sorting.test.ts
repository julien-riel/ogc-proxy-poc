import { describe, it, expect } from 'vitest';
import { parseSortby, buildUpstreamSort, validateSortable } from './sorting.js';
import type { PropertyConfig } from './types.js';

describe('parseSortby', () => {
  it('parses ascending field', () => {
    expect(parseSortby('population')).toEqual([{ field: 'population', order: 'asc' }]);
  });

  it('parses descending field', () => {
    expect(parseSortby('-population')).toEqual([{ field: 'population', order: 'desc' }]);
  });

  it('parses multiple fields', () => {
    const result = parseSortby('arrondissement,-population');
    expect(result).toEqual([
      { field: 'arrondissement', order: 'asc' },
      { field: 'population', order: 'desc' },
    ]);
  });
});

describe('validateSortable', () => {
  const properties: PropertyConfig[] = [
    { name: 'population', type: 'int', sortable: true, upstream: { sortParam: 'sort_by', sortDesc: '-' } },
    { name: 'nom', type: 'string', sortable: true },
    { name: 'etat', type: 'string' },
  ];

  it('returns null for sortable fields with upstream support', () => {
    const error = validateSortable([{ field: 'population', order: 'asc' }], properties);
    expect(error).toBeNull();
  });

  it('returns error for non-sortable field', () => {
    const error = validateSortable([{ field: 'etat', order: 'asc' }], properties);
    expect(error).toContain('etat');
  });

  it('returns error for sortable field without upstream support', () => {
    const error = validateSortable([{ field: 'nom', order: 'asc' }], properties);
    expect(error).toContain('nom');
  });
});

describe('buildUpstreamSort', () => {
  const properties: PropertyConfig[] = [
    { name: 'population', type: 'int', sortable: true, upstream: { sortParam: 'sort_by', sortDesc: '-' } },
  ];

  it('builds ascending sort param', () => {
    const result = buildUpstreamSort([{ field: 'population', order: 'asc' }], properties);
    expect(result).toEqual({ sort_by: 'population' });
  });

  it('builds descending sort param', () => {
    const result = buildUpstreamSort([{ field: 'population', order: 'desc' }], properties);
    expect(result).toEqual({ sort_by: '-population' });
  });
});
