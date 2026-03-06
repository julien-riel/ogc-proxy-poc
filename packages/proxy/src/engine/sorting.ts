import type { PropertyConfig } from './types.js';

export interface SortField {
  field: string;
  order: 'asc' | 'desc';
}

export function parseSortby(sortby: string): SortField[] {
  return sortby.split(',').map(part => {
    const trimmed = part.trim();
    if (trimmed.startsWith('-')) {
      return { field: trimmed.slice(1), order: 'desc' };
    }
    return { field: trimmed, order: 'asc' };
  });
}

/**
 * Validate that all sort fields are sortable and have upstream support.
 * Returns an error message or null.
 */
export function validateSortable(sortFields: SortField[], properties: PropertyConfig[]): string | null {
  for (const sf of sortFields) {
    const prop = properties.find(p => p.name === sf.field);
    if (!prop || !prop.sortable) {
      return `Property '${sf.field}' is not sortable`;
    }
    if (!prop.upstream?.sortParam) {
      return `Property '${sf.field}' is sortable but upstream does not support sorting on this field`;
    }
  }
  return null;
}

/**
 * Build upstream query params for sorting.
 */
export function buildUpstreamSort(
  sortFields: SortField[],
  properties: PropertyConfig[],
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const sf of sortFields) {
    const prop = properties.find(p => p.name === sf.field);
    if (!prop?.upstream?.sortParam) continue;
    const prefix = sf.order === 'desc' ? (prop.upstream.sortDesc ?? '-') : '';
    params[prop.upstream.sortParam] = `${prefix}${sf.field}`;
  }
  return params;
}
