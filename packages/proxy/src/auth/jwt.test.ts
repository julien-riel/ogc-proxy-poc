import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createJwtMiddleware } from './jwt.js';

vi.mock('@villedemontreal/jwt-validator', () => ({
  init: vi.fn(),
  jwtValidationMiddleware: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));
vi.mock('@villedemontreal/logger', () => ({
  createLogger: vi.fn(),
}));
vi.mock('@villedemontreal/correlation-id', () => ({
  correlationIdService: { getId: vi.fn(() => 'test-id') },
}));

describe('createJwtMiddleware', () => {
  it('should return a no-op middleware when JWT is disabled', async () => {
    const middleware = await createJwtMiddleware({ enabled: false, host: '' });

    let nextCalled = false;
    const req = {} as any;
    const res = {} as any;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    expect(nextCalled).toBe(true);
  });

  it('should return a no-op middleware when config is undefined', async () => {
    const middleware = await createJwtMiddleware(undefined);

    let nextCalled = false;
    const req = {} as any;
    const res = {} as any;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    expect(nextCalled).toBe(true);
  });

});

describe('createJwtMiddleware — enabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if host is missing', async () => {
    await expect(createJwtMiddleware({ enabled: true, host: '' }))
      .rejects.toThrow('JWT is enabled but jwt.host is not configured');
  });

  it('calls init with correct args when enabled with a valid host', async () => {
    const { init } = await import('@villedemontreal/jwt-validator');
    const { createLogger } = await import('@villedemontreal/logger');

    await createJwtMiddleware({ enabled: true, host: 'https://auth.example.com' });

    expect(init).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledWith(
      createLogger,
      expect.any(Function),
      'https://auth.example.com',
      undefined
    );
  });

  it('passes both host and endpoint to init when both are configured', async () => {
    const { init } = await import('@villedemontreal/jwt-validator');
    const { createLogger } = await import('@villedemontreal/logger');

    await createJwtMiddleware({
      enabled: true,
      host: 'https://auth.example.com',
      endpoint: '/jwks',
    });

    expect(init).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledWith(
      createLogger,
      expect.any(Function),
      'https://auth.example.com',
      '/jwks'
    );
  });

  it('returns a callable middleware that calls next()', async () => {
    const middleware = await createJwtMiddleware({
      enabled: true,
      host: 'https://auth.example.com',
    });

    let nextCalled = false;
    const req = {} as any;
    const res = {} as any;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    expect(nextCalled).toBe(true);
  });

  it('passes correlationIdService.getId as the second arg to init', async () => {
    const { init } = await import('@villedemontreal/jwt-validator');
    const { correlationIdService } = await import('@villedemontreal/correlation-id');

    await createJwtMiddleware({ enabled: true, host: 'https://auth.example.com' });

    const getIdCallback = (init as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const result = getIdCallback();
    expect(correlationIdService.getId).toHaveBeenCalled();
    expect(result).toBe('test-id');
  });
});
