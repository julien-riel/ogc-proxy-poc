import type { RequestHandler } from 'express';
import type { JwtConfig } from '../engine/types.js';

const noopMiddleware: RequestHandler = (_req, _res, next) => next();

/**
 * Creates JWT validation middleware based on config.
 * When JWT is disabled or config is absent, returns a passthrough middleware.
 */
export function createJwtMiddleware(config: JwtConfig | undefined): RequestHandler {
  if (!config?.enabled) {
    return noopMiddleware;
  }

  const { init, jwtValidationMiddleware } = require('@villedemontreal/jwt-validator');
  const { createLogger } = require('@villedemontreal/logger');
  const { correlationIdService } = require('@villedemontreal/correlation-id');

  init(
    createLogger,
    () => correlationIdService.getId(),
    config.host,
    config.endpoint
  );

  return jwtValidationMiddleware();
}
