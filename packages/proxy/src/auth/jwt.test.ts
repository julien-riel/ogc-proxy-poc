import { describe, it, expect } from 'vitest';
import { createJwtMiddleware } from './jwt.js';

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

  it('should throw when enabled but host is missing', async () => {
    await expect(createJwtMiddleware({ enabled: true, host: '' }))
      .rejects.toThrow('JWT is enabled but jwt.host is not configured');
  });
});
