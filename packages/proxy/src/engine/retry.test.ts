import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './retry.js';
import { UpstreamError, UpstreamTimeoutError } from './adapter.js';

vi.mock('../logger.js', () => ({
  logger: {
    adapter: () => ({
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('withRetry', () => {
  const options = { maxAttempts: 3, backoffMs: 10, backoffMultiplier: 2 };

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, options);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx upstream error', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new UpstreamError(502)).mockResolvedValue('ok');
    const result = await withRetry(fn, options);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on timeout', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new UpstreamTimeoutError('http://test', 5000)).mockResolvedValue('ok');
    const result = await withRetry(fn, options);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 4xx errors', async () => {
    const fn = vi.fn().mockRejectedValue(new UpstreamError(404));
    await expect(withRetry(fn, options)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 429', async () => {
    const fn = vi.fn().mockRejectedValue(new UpstreamError(429));
    await expect(withRetry(fn, options)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new UpstreamError(500));
    await expect(withRetry(fn, options)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on generic network errors', async () => {
    const err = new Error('ECONNRESET');
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue('ok');
    const result = await withRetry(fn, options);
    expect(result).toBe('ok');
  });

  it('applies exponential backoff', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new UpstreamError(500))
      .mockRejectedValueOnce(new UpstreamError(500))
      .mockResolvedValue('ok');
    const start = Date.now();
    await withRetry(fn, { maxAttempts: 3, backoffMs: 10, backoffMultiplier: 2 });
    const elapsed = Date.now() - start;
    // First retry: 10ms, second retry: 20ms = 30ms total minimum
    expect(elapsed).toBeGreaterThanOrEqual(25);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
