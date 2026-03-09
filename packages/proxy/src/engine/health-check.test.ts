import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthChecker } from './health-check.js';

vi.mock('../logger.js', () => ({
  logger: {
    adapter: () => ({
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock('../metrics.js', () => ({
  safeMetric: (fn: () => void) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  },
}));

vi.mock('prom-client', () => {
  class MockGauge {
    set = vi.fn();
  }
  return { Gauge: MockGauge };
});

describe('HealthChecker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    checker = new HealthChecker();
  });

  afterEach(() => {
    checker.stop();
    vi.restoreAllMocks();
  });

  it('reports unknown status initially', () => {
    expect(checker.getStatus('test')).toBe('unknown');
  });

  it('reports healthy after successful check', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await checker.check('test', 'http://localhost/api');
    expect(checker.getStatus('test')).toBe('healthy');
  });

  it('reports unhealthy after failed fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    await checker.check('test', 'http://localhost/api');
    expect(checker.getStatus('test')).toBe('unhealthy');
  });

  it('reports unhealthy on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await checker.check('test', 'http://localhost/api');
    expect(checker.getStatus('test')).toBe('unhealthy');
  });

  it('returns all statuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await checker.check('a', 'http://a');
    await checker.check('b', 'http://b');
    const all = checker.getAllStatuses();
    expect(all).toEqual({ a: 'healthy', b: 'healthy' });
  });

  it('stop clears interval', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    checker.startPeriodic({ test: { upstream: { baseUrl: 'http://test' } } }, 60000);
    checker.stop();
    // Should not throw
    checker.stop();
  });
});
