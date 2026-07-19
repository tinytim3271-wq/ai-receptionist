import { randomUUID } from 'node:crypto';
import { db } from '../db';

export interface LogInteractionInput {
  callId?: string;
  modelName: string;
  modelVendor?: string;
  promptVersion: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  confidence?: number;
  decisionOutcome?: string;
}

export function logInteraction(input: LogInteractionInput): string {
  const id = randomUUID();
  db.prepare(
    `insert into ai_interactions
       (id, call_id, model_name, model_vendor, prompt_version, action_type, action_payload, confidence, decision_outcome, approved_by_human, created_at)
     values
       (@id, @callId, @modelName, @modelVendor, @promptVersion, @actionType, @actionPayload, @confidence, @decisionOutcome, 0, @createdAt)`
  ).run({
    id,
    callId: input.callId ?? null,
    modelName: input.modelName,
    modelVendor: input.modelVendor ?? null,
    promptVersion: input.promptVersion,
    actionType: input.actionType,
    actionPayload: JSON.stringify(input.actionPayload),
    confidence: input.confidence ?? null,
    decisionOutcome: input.decisionOutcome ?? null,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export interface LogGuardrailEventInput {
  callId?: string;
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  ruleName: string;
  rawOutput?: Record<string, unknown>;
  actionTaken: string;
}

export function logGuardrailEvent(input: LogGuardrailEventInput): string {
  const id = randomUUID();
  db.prepare(
    `insert into ai_guardrail_events
       (id, call_id, event_type, severity, rule_name, raw_output, action_taken, created_at)
     values
       (@id, @callId, @eventType, @severity, @ruleName, @rawOutput, @actionTaken, @createdAt)`
  ).run({
    id,
    callId: input.callId ?? null,
    eventType: input.eventType,
    severity: input.severity,
    ruleName: input.ruleName,
    rawOutput: input.rawOutput ? JSON.stringify(input.rawOutput) : null,
    actionTaken: input.actionTaken,
    createdAt: new Date().toISOString(),
  });
  return id;
}
