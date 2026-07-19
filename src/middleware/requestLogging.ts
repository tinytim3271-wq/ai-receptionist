import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  const requestId = randomUUID();

  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const logLine = {
      ts: new Date().toISOString(),
      level: 'info',
      event: 'http_request',
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latencyMs: Number(elapsedMs.toFixed(2)),
      ip: req.ip,
      userAgent: req.get('user-agent') ?? '',
    };
    console.log(JSON.stringify(logLine));
  });

  next();
}