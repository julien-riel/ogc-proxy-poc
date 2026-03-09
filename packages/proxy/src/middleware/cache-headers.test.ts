import { describe, it, expect } from 'vitest';
import { generateETag, buildCacheControlHeader } from './cache-headers.js';

describe('generateETag', () => {
  it('generates consistent etag for same content', () => {
    const content = JSON.stringify({ test: true });
    expect(generateETag(content)).toBe(generateETag(content));
  });

  it('generates different etags for different content', () => {
    expect(generateETag('a')).not.toBe(generateETag('b'));
  });

  it('wraps in double quotes', () => {
    const etag = generateETag('test');
    expect(etag.startsWith('"')).toBe(true);
    expect(etag.endsWith('"')).toBe(true);
  });
});

describe('buildCacheControlHeader', () => {
  it('builds header from TTL', () => {
    expect(buildCacheControlHeader(300)).toBe('public, max-age=300, stale-while-revalidate=150');
  });

  it('returns no-cache when TTL is 0', () => {
    expect(buildCacheControlHeader(0)).toBe('no-cache');
  });

  it('floors stale-while-revalidate', () => {
    expect(buildCacheControlHeader(61)).toBe('public, max-age=61, stale-while-revalidate=30');
  });
});
