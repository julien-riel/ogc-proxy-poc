import type { RequestHandler } from 'express';
import type { JwtConfig } from '../engine/types.js';

const noopMiddleware: RequestHandler = (_req, _res, next) => next();

/**
 * Creates JWT validation middleware based on config.
 * When JWT is disabled or config is absent, returns a passthrough middleware.
 */
export async function createJwtMiddleware(config: JwtConfig | undefined): Promise<RequestHandler> {
  if (!config?.enabled) {
    return noopMiddleware;
  }

  if (!config.host) {
    throw new Error('JWT is enabled but jwt.host is not configured');
  }

  const { init, jwtValidationMiddleware } = await import('@villedemontreal/jwt-validator');
  const { createLogger } = await import('@villedemontreal/logger');
  const { correlationIdService } = await import('@villedemontreal/correlation-id');

  init(createLogger, () => correlationIdService.getId(), config.host, config.endpoint);

  return jwtValidationMiddleware();
}
