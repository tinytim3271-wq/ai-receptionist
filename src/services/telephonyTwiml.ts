import { createHash, randomUUID } from 'node:crypto';

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Each Gather must POST to a unique turnId so identical SpeechResult values
 * (e.g. two "yes" answers) do not share an idempotency key and replay stale TwiML.
 * Twilio retries hit the same action URL, so real retries still dedupe correctly.
 */
export function buildTwimlGather(prompt: string, turnId: string = randomUUID()): string {
  const action = `/api/telephony/twilio/voice/turn?turnId=${encodeURIComponent(turnId)}`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" speechTimeout="auto" method="POST" action="${action}"><Say>${xmlEscape(
    prompt
  )}</Say></Gather><Redirect method="POST">${action}</Redirect></Response>`;
}

export function buildTwimlHangup(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${xmlEscape(message)}</Say><Hangup/></Response>`;
}

export function extractTurnId(query: Record<string, unknown> | undefined): string | undefined {
  const raw = query?.turnId;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim()) return raw[0].trim();
  return undefined;
}

export function buildTelephonyEventKey(
  kind: 'start' | 'turn' | 'end',
  body: Record<string, string>,
  turnId?: string
): string {
  const callSid = body.CallSid ?? 'unknown';
  const explicitKey = body.EventSid || body.RequestSid || turnId;
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
