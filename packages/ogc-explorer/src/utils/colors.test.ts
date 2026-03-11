import { describe, it, expect } from 'vitest';
import { getCollectionColor } from './colors.js';

describe('getCollectionColor', () => {
  it('returns a color string for index 0', () => {
    const color = getCollectionColor(0);
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('returns different colors for different indices', () => {
    const colors = new Set([0, 1, 2, 3, 4].map(getCollectionColor));
    expect(colors.size).toBe(5);
  });

  it('wraps around when index exceeds palette size', () => {
    const color0 = getCollectionColor(0);
    const color100 = getCollectionColor(100);
    expect(color100).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(typeof color0).toBe('string');
  });
});
