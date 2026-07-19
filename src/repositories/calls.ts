import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { AnsweredBy, CallDirection, CallRecord } from '../types';

interface CallRow {
  id: string;
  external_call_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  phone_number: string;
  direction: string;
  channel: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  answered_by: string;
  transferred_to: string | null;
  recording_url: string | null;
  transcript: string | null;
  transcript_summary: string | null;
  disposition: string | null;
  sentiment: string | null;
  priority_score: number;
  escalation_reason: string | null;
  created_at: string;
}

function toCall(row: CallRow): CallRecord {
  return {
    id: row.id,
    externalCallId: row.external_call_id ?? undefined,
    customerId: row.customer_id ?? undefined,
    vehicleId: row.vehicle_id ?? undefined,
    phoneNumber: row.phone_number,
    direction: row.direction as CallDirection,
    channel: row.channel as CallRecord['channel'],
    startedAt: row.started_at,
    answeredAt: row.answered_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    answeredBy: row.answered_by as AnsweredBy,
    transferredTo: row.transferred_to ?? undefined,
    recordingUrl: row.recording_url ?? undefined,
    transcript: row.transcript ?? undefined,
    transcriptSummary: row.transcript_summary ?? undefined,
    disposition: row.disposition ?? undefined,
    sentiment: row.sentiment ?? undefined,
    priorityScore: row.priority_score,
    escalationReason: row.escalation_reason ?? undefined,
    createdAt: row.created_at,
  };
}

export function getCallById(id: string): CallRecord | undefined {
  const row = db.prepare<[string], CallRow>('select * from calls where id = ?').get(id);
  return row ? toCall(row) : undefined;
}

export interface StartCallInput {
  externalCallId?: string;
  phoneNumber: string;
  direction: CallDirection;
  channel?: string;
  startedAt: string;
  answeredBy: AnsweredBy;
}

export function startCall(input: StartCallInput): CallRecord {
  const id = randomUUID();
  db.prepare(
    `insert into calls (id, external_call_id, phone_number, direction, channel, started_at, answered_at, answered_by, created_at)
     values (@id, @externalCallId, @phoneNumber, @direction, @channel, @startedAt, @answeredAt, @answeredBy, @createdAt)`
  ).run({
    id,
    externalCallId: input.externalCallId ?? null,
    phoneNumber: input.phoneNumber,
    direction: input.direction,
    channel: input.channel ?? 'voice',
    startedAt: input.startedAt,
    answeredAt: new Date().toISOString(),
    answeredBy: input.answeredBy,
    createdAt: new Date().toISOString(),
  });
  return getCallById(id)!;
}

const updatableColumns: Record<string, string> = {
  customerId: 'customer_id',
  vehicleId: 'vehicle_id',
  endedAt: 'ended_at',
  durationSeconds: 'duration_seconds',
  transferredTo: 'transferred_to',
  disposition: 'disposition',
  sentiment: 'sentiment',
  priorityScore: 'priority_score',
  escalationReason: 'escalation_reason',
};

export function updateCall(id: string, patch: Record<string, unknown>): CallRecord | undefined {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const [key, column] of Object.entries(updatableColumns)) {
    if (patch[key] !== undefined) {
      sets.push(`${column} = @${key}`);
      params[key] = patch[key];
    }
  }
  if (sets.length > 0) {
    db.prepare(`update calls set ${sets.join(', ')} where id = @id`).run(params);
  }
  return getCallById(id);
}

export function attachTranscript(id: string, transcript: string, transcriptSummary: string): CallRecord | undefined {
  db.prepare('update calls set transcript = ?, transcript_summary = ? where id = ?').run(transcript, transcriptSummary, id);
  return getCallById(id);
}
