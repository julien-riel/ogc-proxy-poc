import type { DefaultsConfig } from './types.js';

interface LimitsInput {
  limit: number;
  offset: number;
}

export interface LimitsResult {
  limit: number;
  offset: number;
  capped: boolean;
  rejected: boolean;
  suppressNext: boolean;
  maxPageSize: number;
  maxFeatures: number;
}

interface CollectionLimits {
  maxPageSize?: number;
  maxFeatures?: number;
}

export function applyLimits(input: LimitsInput, collection: CollectionLimits, defaults: DefaultsConfig): LimitsResult {
  const maxPageSize = collection.maxPageSize ?? defaults.maxPageSize ?? 1000;
  const maxFeatures = collection.maxFeatures ?? defaults.maxFeatures ?? 10000;

  const capped = input.limit > maxPageSize;
  const limit = Math.min(input.limit, maxPageSize);
  const rejected = input.offset >= maxFeatures;
  const suppressNext = input.offset + limit >= maxFeatures;

  return {
    limit,
    offset: input.offset,
    capped,
    rejected,
    suppressNext,
    maxPageSize,
    maxFeatures,
  };
}
