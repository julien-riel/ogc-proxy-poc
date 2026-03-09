import type { RequestHandler } from 'express';

const EXEMPT_PATHS = ['/health', '/ready', '/metrics'];

export function httpsRedirect(): RequestHandler {
  return (req, res, next) => {
    if (EXEMPT_PATHS.includes(req.path)) return next();
    const proto = req.get('X-Forwarded-Proto') || req.protocol;
    if (proto === 'https') return next();
    const host = req.get('Host') || 'localhost';
    res.redirect(301, `https://${host}${req.originalUrl}`);
  };
}
