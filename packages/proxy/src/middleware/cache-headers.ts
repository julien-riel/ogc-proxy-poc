import { createHash } from 'crypto';

export function generateETag(content: string): string {
  return `"${createHash('md5').update(content).digest('hex')}"`;
}

export function buildCacheControlHeader(ttlSeconds: number): string {
  if (!ttlSeconds) return 'no-cache';
  return `public, max-age=${ttlSeconds}, stale-while-revalidate=${Math.floor(ttlSeconds / 2)}`;
}
