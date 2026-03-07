import { describe, it, expect } from 'vitest';
import { createJwtMiddleware } from './jwt.js';

describe('createJwtMiddleware', () => {
  it('should return a no-op middleware when JWT is disabled', async () => {
    const middleware = createJwtMiddleware({ enabled: false, host: '' });

    let nextCalled = false;
    const req = {} as any;
    const res = {} as any;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    expect(nextCalled).toBe(true);
  });

  it('should return a no-op middleware when config is undefined', async () => {
    const middleware = createJwtMiddleware(undefined);

    let nextCalled = false;
    const req = {} as any;
    const res = {} as any;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    expect(nextCalled).toBe(true);
  });
});
