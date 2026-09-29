import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import type { Request, Response } from 'express';
import { endSession, getSession, handleCallerMessage, startSession } from '../ai/receptionist';
import { config } from '../config';
import { logGuardrailEvent } from '../repositories/aiInteractions';
import { createCallbackTask } from '../repositories/callbackTasks';
import { getCallByExternalCallId, startCall, updateCall } from '../repositories/calls';
import { getWebhookEvent, tryClaimWebhookEvent, completeWebhookEvent } from '../repositories/telephonyWebhookEvents';

export const telephonyRouter = Router();
telephonyRouter.use(express.urlencoded({ extended: false }));

const PROVIDER = 'twilio';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildTwimlGather(prompt: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" speechTimeout="auto" method="POST" action="/api/telephony/twilio/voice/turn"><Say>${xmlEscape(
    prompt
  )}</Say></Gather><Redirect method="POST">/api/telephony/twilio/voice/turn</Redirect></Response>`;
}

function buildTwimlHangup(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${xmlEscape(message)}</Say><Hangup/></Response>`;
}

function getFormBody(req: Request): Record<string, string> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    result[key] = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
  }
  return result;
}

function resolveWebhookUrl(req: Request): string {
  if (config.telephonyWebhookBaseUrl) {
    return `${config.telephonyWebhookBaseUrl.replace(/\/$/, '')}${req.originalUrl}`;
  }
  return `${req.protocol}://${req.get('host')}${req.originalUrl}`;
}

function isTwilioSignatureValid(req: Request): boolean {
  const token = config.telephonyTwilioAuthToken;
  if (!token) return false;

  const signatureHeader = req.header('x-twilio-signature') ?? '';
  if (!signatureHeader) return false;

  const url = resolveWebhookUrl(req);
  const body = getFormBody(req);
  const sortedKeys = Object.keys(body).sort();
  let payload = url;
  for (const key of sortedKeys) {
    payload += key + body[key];
  }

  const expected = createHmac('sha1', token).update(payload, 'utf8').digest('base64');
  const expectedBuf = Buffer.from(expected);
  const givenBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== givenBuf.length) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}

function verifyTelephonySignature(req: Request, res: Response): boolean {
  if (!config.telephonyRequireSignature) return true;

  const requestId = typeof res.locals.requestId === 'string' ? res.locals.requestId : undefined;
  if (!config.telephonyTwilioAuthToken) {
    logGuardrailEvent({
      eventType: 'telephony_signature_rejected',
      severity: 'critical',
      ruleName: 'telephony_signature',
      rawOutput: { reason: 'missing_telephony_auth_token', path: req.originalUrl, requestId },
      actionTaken: 'Rejected request with 503',
    });
    res.status(503).json({ message: 'Telephony auth token is not configured' });
    return false;
  }

  if (!isTwilioSignatureValid(req)) {
    logGuardrailEvent({
      eventType: 'telephony_signature_rejected',
      severity: 'warning',
      ruleName: 'telephony_signature',
      rawOutput: {
        reason: 'invalid_signature',
        path: req.originalUrl,
        callSid: getFormBody(req).CallSid,
        requestId,
      },
      actionTaken: 'Rejected request with 401',
    });
    res.status(401).json({ message: 'Invalid telephony signature' });
    return false;
  }
  return true;
}

function withTimeout<T>(factory: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('ai_timeout')), timeoutMs);
  return factory(controller.signal).finally(() => clearTimeout(timer));
}

async function waitForCachedWebhookResponse(
  eventKey: string,
  timeoutMs = Math.max(1000, config.telephonyAiTimeoutMs + 2000)
): Promise<{ status: number; body: string } | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const existing = getWebhookEvent(PROVIDER, eventKey);
    if (existing?.responseBody) {
      return { status: existing.responseCode || 200, body: existing.responseBody };
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

async function createFallbackAndCallback(callId: string, reason: string): Promise<string> {
  const call = updateCall(callId, { disposition: 'callback_scheduled', escalationReason: reason });
  if (call?.disposition !== 'callback_scheduled') {
    updateCall(callId, { disposition: 'callback_scheduled' });
  }

  createCallbackTask({
    callId,
    reason: `Telephony AI fallback: ${reason}`,
    queueName: 'service_advisor',
    priority: 'high',
  });

  logGuardrailEvent({
    callId,
    eventType: 'telephony_ai_fallback',
    severity: 'warning',
    ruleName: 'telephony_timeout_fallback',
    rawOutput: { reason },
    actionTaken: 'Created callback task and used fallback caller response',
  });

  return 'I am having trouble completing that right now. A service advisor will call you back shortly to help.';
}

function buildEventKey(kind: 'start' | 'turn' | 'end', body: Record<string, string>): string {
  const callSid = body.CallSid ?? 'unknown';
  const explicitKey = body.EventSid || body.RequestSid;
  if (explicitKey) return `${callSid}:${kind}:${explicitKey}`;

  const payloadFingerprint = createHash('sha256')
    .update(
      Object.keys(body)
        .sort()
        .map((k) => `${k}=${body[k]}`)
        .join('&')
    )
    .digest('hex')
    .slice(0, 24);
  return `${callSid}:${kind}:${payloadFingerprint}`;
}

async function runIdempotentXml(
  eventKey: string,
  callId: string | undefined,
  handler: () => Promise<string>
): Promise<{ status: number; body: string }> {
  const existing = getWebhookEvent(PROVIDER, eventKey);
  if (existing?.responseBody) {
    return { status: existing.responseCode || 200, body: existing.responseBody };
  }

  // Claim the unique (provider, event_key) row before side effects so concurrent
  // Twilio retries cannot both execute the handler.
  if (!tryClaimWebhookEvent({ provider: PROVIDER, eventKey, callId })) {
    const cached = await waitForCachedWebhookResponse(eventKey);
    if (cached) return cached;
    // Winner abandoned without completing — fall through is unsafe; return a safe gather.
    return {
      status: 200,
      body: buildTwimlGather('Thanks for holding. Please say that again so I can help.'),
    };
  }

  try {
    const body = await handler();
    const status = 200;
    completeWebhookEvent({ provider: PROVIDER, eventKey, responseCode: status, responseBody: body });
    return { status, body };
  } catch {
    // Unblock concurrent waiters; handlers that need callback tasks should catch themselves.
    const body = buildTwimlGather('I am having trouble completing that right now. Please try again shortly.');
    completeWebhookEvent({ provider: PROVIDER, eventKey, responseCode: 200, responseBody: body });
    return { status: 200, body };
  }
}

function ensureCallForSid(callSid: string, from: string): { callId: string; isNew: boolean } {
  const existing = getCallByExternalCallId(callSid);
  if (existing) {
    return { callId: existing.id, isNew: false };
  }
  const call = startCall({
    externalCallId: callSid,
    phoneNumber: from,
    direction: 'inbound',
    channel: 'voice',
    startedAt: new Date().toISOString(),
    answeredBy: 'ai',
  });
  return { callId: call.id, isNew: true };
}

telephonyRouter.post('/twilio/voice/start', async (req, res) => {
  if (!verifyTelephonySignature(req, res)) return;
  const body = getFormBody(req);
  const callSid = body.CallSid ?? '';
  const from = body.From ?? 'unknown';
  if (!callSid) {
    res.status(400).json({ message: 'CallSid is required' });
    return;
  }

  const { callId, isNew } = ensureCallForSid(callSid, from);
  if (isNew || !getSession(callId)) {
    startSession(callId, from);
  }

  const eventKey = buildEventKey('start', body);
  const result = await runIdempotentXml(eventKey, callId, async () =>
    buildTwimlGather('Thanks for calling Reliable Shop Systems. How can I help you today?')
  );

  res.type('text/xml').status(result.status).send(result.body);
});

telephonyRouter.post('/twilio/voice/turn', async (req, res) => {
  if (!verifyTelephonySignature(req, res)) return;
  const body = getFormBody(req);
  const callSid = body.CallSid ?? '';
  const from = body.From ?? 'unknown';
  if (!callSid) {
    res.status(400).json({ message: 'CallSid is required' });
    return;
  }

  const { callId, isNew } = ensureCallForSid(callSid, from);
  if (isNew || !getSession(callId)) {
    startSession(callId, from);
  }

  const eventKey = buildEventKey('turn', body);
  const result = await runIdempotentXml(eventKey, callId, async () => {
    const speech = (body.SpeechResult ?? '').trim();
    if (!speech) {
      return buildTwimlGather('I did not catch that. Please tell me briefly what you need help with.');
    }

    try {
      const aiResult = await withTimeout(
        (signal) => handleCallerMessage(callId, speech, { signal }),
        config.telephonyAiTimeoutMs
      );
      const reply = (aiResult.reply ?? '').trim() || 'Could you share a little more detail so I can help?';
      return buildTwimlGather(reply);
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'unknown_error';
      const reason =
        (err instanceof Error && err.name === 'AbortError') || /ai_timeout|aborted/i.test(raw)
          ? 'ai_timeout'
          : raw;
      const fallback = await createFallbackAndCallback(callId, reason);
      return buildTwimlGather(fallback);
    }
  });

  res.type('text/xml').status(result.status).send(result.body);
});

telephonyRouter.post('/twilio/voice/end', async (req, res) => {
  if (!verifyTelephonySignature(req, res)) return;
  const body = getFormBody(req);
  const callSid = body.CallSid ?? '';
  if (!callSid) {
    res.status(400).json({ message: 'CallSid is required' });
    return;
  }

  const call = getCallByExternalCallId(callSid);
  const eventKey = buildEventKey('end', body);
  const result = await runIdempotentXml(eventKey, call?.id, async () => {
    if (call) {
      await endSession(call.id);
      updateCall(call.id, { endedAt: new Date().toISOString(), disposition: call.disposition ?? 'completed' });
    }
    return buildTwimlHangup('Thank you for calling Reliable Shop Systems. Goodbye.');
  });

  res.type('text/xml').status(result.status).send(result.body);
});

telephonyRouter.post('/twilio/voice', (_req, res) => {
  res.status(410).json({
    message:
      'Deprecated endpoint. Configure provider webhooks to /api/telephony/twilio/voice/start, /turn, and /end.',
  });
});
