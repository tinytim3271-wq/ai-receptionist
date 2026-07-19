import { randomUUID } from 'node:crypto';
import { db } from '../db';

interface TelephonyWebhookEventRow {
  id: string;
  provider: string;
  event_key: string;
  call_id: string | null;
  response_code: number;
  response_body: string | null;
  created_at: string;
}

export interface TelephonyWebhookEvent {
  id: string;
  provider: string;
  eventKey: string;
  callId?: string;
  responseCode: number;
  responseBody?: string;
  createdAt: string;
}

function toEvent(row: TelephonyWebhookEventRow): TelephonyWebhookEvent {
  return {
    id: row.id,
    provider: row.provider,
    eventKey: row.event_key,
    callId: row.call_id ?? undefined,
    responseCode: row.response_code,
    responseBody: row.response_body ?? undefined,
    createdAt: row.created_at,
  };
}

export function getWebhookEvent(provider: string, eventKey: string): TelephonyWebhookEvent | undefined {
  const row = db
    .prepare<[string, string], TelephonyWebhookEventRow>('select * from telephony_webhook_events where provider = ? and event_key = ?')
    .get(provider, eventKey);
  return row ? toEvent(row) : undefined;
}

export function recordWebhookEvent(input: {
  provider: string;
  eventKey: string;
  callId?: string;
  responseCode: number;
  responseBody?: string;
}): TelephonyWebhookEvent {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `insert into telephony_webhook_events (id, provider, event_key, call_id, response_code, response_body, created_at)
     values (@id, @provider, @eventKey, @callId, @responseCode, @responseBody, @createdAt)`
  ).run({
    id,
    provider: input.provider,
    eventKey: input.eventKey,
    callId: input.callId ?? null,
    responseCode: input.responseCode,
    responseBody: input.responseBody ?? null,
    createdAt,
  });
  return getWebhookEvent(input.provider, input.eventKey)!;
}
