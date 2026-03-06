import { describe, it, expect } from 'vitest';
import { applyLimits } from './limits.js';
import type { DefaultsConfig } from './types.js';

const defaults: DefaultsConfig = { maxPageSize: 1000, maxFeatures: 10000 };

describe('applyLimits', () => {
  it('caps limit to maxPageSize', () => {
    const result = applyLimits({ limit: 5000, offset: 0 }, { maxPageSize: 500 }, defaults);
    expect(result.limit).toBe(500);
    expect(result.capped).toBe(true);
  });

  it('uses collection maxPageSize over defaults', () => {
    const result = applyLimits({ limit: 800, offset: 0 }, { maxPageSize: 200 }, defaults);
    expect(result.limit).toBe(200);
  });

  it('uses default maxPageSize when collection has none', () => {
    const result = applyLimits({ limit: 5000, offset: 0 }, {}, defaults);
    expect(result.limit).toBe(1000);
  });

  it('does not cap limit when under maxPageSize', () => {
    const result = applyLimits({ limit: 10, offset: 0 }, {}, defaults);
    expect(result.limit).toBe(10);
    expect(result.capped).toBe(false);
  });

  it('rejects offset beyond maxFeatures', () => {
    const result = applyLimits({ limit: 10, offset: 15000 }, {}, defaults);
    expect(result.rejected).toBe(true);
  });

  it('signals suppressNext when offset + limit >= maxFeatures', () => {
    const result = applyLimits({ limit: 100, offset: 9950 }, {}, defaults);
    expect(result.suppressNext).toBe(true);
  });

  it('does not suppress next when within maxFeatures', () => {
    const result = applyLimits({ limit: 100, offset: 0 }, {}, defaults);
    expect(result.suppressNext).toBe(false);
  });
});
