import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { logGuardrailEvent } from '../repositories/aiInteractions';

function tokenMatches(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

export function requireBearerAuth(req: Request, res: Response, next: NextFunction): void {
  const requestId = typeof res.locals.requestId === 'string' ? res.locals.requestId : undefined;
  const authHeader = req.header('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    logGuardrailEvent({
      eventType: 'auth_denied',
      severity: 'warning',
      ruleName: 'api_bearer_auth',
      rawOutput: {
        method: req.method,
        path: req.originalUrl,
        reason: 'missing_or_invalid_authorization_header',
        requestId,
      },
      actionTaken: 'Rejected request with 401',
    });
    res.status(401).json({ message: 'Authorization header with Bearer token is required' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token || !tokenMatches(token, config.apiBearerToken)) {
    logGuardrailEvent({
      eventType: 'auth_denied',
      severity: 'warning',
      ruleName: 'api_bearer_auth',
      rawOutput: {
        method: req.method,
        path: req.originalUrl,
        reason: 'token_mismatch',
        requestId,
      },
      actionTaken: 'Rejected request with 403',
    });
    res.status(403).json({ message: 'Invalid API token' });
    return;
  }

  next();
}