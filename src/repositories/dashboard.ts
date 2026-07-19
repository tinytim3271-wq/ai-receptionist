import { db } from '../db';

interface CountRow {
  count: number;
}

interface TrendRow {
  hour_utc: string;
  auth_denied_count: number;
  blocked_autobook_count: number;
  telephony_fallback_count: number;
}

interface CallRow {
  id: string;
  external_call_id: string | null;
  phone_number: string;
  channel: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  disposition: string | null;
  escalation_reason: string | null;
  priority_score: number;
}

interface CallbackRow {
  id: string;
  call_id: string | null;
  queue_name: string;
  priority: string;
  status: string;
  reason: string;
  created_at: string;
  due_at: string | null;
}

interface WebhookEventRow {
  provider: string;
  event_key: string;
  call_id: string | null;
  response_code: number;
  created_at: string;
}

export interface OperationsDashboardSnapshot {
  generatedAt: string;
  range: {
    key: '24h' | '7d';
    hours: number;
  };
  summary: {
    callsInRange: number;
    openCallbacks: number;
    authDeniedInRange: number;
    blockedAutobookInRange: number;
    telephonyFallbacksInRange: number;
    telephonyEventsInRange: number;
  };
  trends: Array<{
    hourUtc: string;
    authDeniedCount: number;
    blockedAutobookCount: number;
    telephonyFallbackCount: number;
  }>;
  recentCalls: Array<{
    id: string;
    externalCallId?: string;
    phoneNumber: string;
    channel: string;
    startedAt: string;
    endedAt?: string;
    durationSeconds?: number;
    disposition?: string;
    escalationReason?: string;
    priorityScore: number;
  }>;
  callbackQueue: Array<{
    id: string;
    callId?: string;
    queueName: string;
    priority: string;
    status: string;
    reason: string;
    createdAt: string;
    dueAt?: string;
  }>;
  recentTelephonyEvents: Array<{
    provider: string;
    eventKey: string;
    callId?: string;
    responseCode: number;
    createdAt: string;
  }>;
}

export interface DashboardQueryOptions {
  limit?: number;
  rangeKey?: '24h' | '7d';
}

function getCount(query: string, params: unknown[] = []): number {
  const row = db.prepare<unknown[], CountRow>(query).get(...params);
  return row?.count ?? 0;
}

export function getOperationsDashboardSnapshot(options: DashboardQueryOptions = {}): OperationsDashboardSnapshot {
  const rangeKey = options.rangeKey === '7d' ? '7d' : '24h';
  const rangeHours = rangeKey === '7d' ? 24 * 7 : 24;
  const rangeInterval = `-${rangeHours} hour`;
  const groupExpr = rangeKey === '7d' ? "substr(created_at, 1, 10)" : "substr(created_at, 1, 13)";
  const limit = options.limit ?? 20;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;

  const callsInRange = getCount(
    `select count(*) as count
     from calls
     where started_at >= datetime('now', ?)`
    ,
    [rangeInterval]
  );

  const openCallbacks = getCount(
    `select count(*) as count
     from callback_tasks
     where status in ('open', 'in_progress')`
  );

  const authDeniedInRange = getCount(
    `select count(*) as count
     from ai_guardrail_events
     where event_type = 'auth_denied'
       and created_at >= datetime('now', ?)`
    ,
    [rangeInterval]
  );

  const blockedAutobookInRange = getCount(
    `select count(*) as count
     from ai_guardrail_events
     where event_type in ('blocked_autobook', 'blocked_autobook_rest')
       and created_at >= datetime('now', ?)`
    ,
    [rangeInterval]
  );

  const telephonyFallbacksInRange = getCount(
    `select count(*) as count
     from ai_guardrail_events
     where event_type = 'telephony_ai_fallback'
       and created_at >= datetime('now', ?)`
    ,
    [rangeInterval]
  );

  const telephonyEventsInRange = getCount(
    `select count(*) as count
     from telephony_webhook_events
     where created_at >= datetime('now', ?)`
    ,
    [rangeInterval]
  );

  const trends = db
    .prepare<unknown[], TrendRow>(
      `select
         ${groupExpr} as hour_utc,
         sum(case when event_type = 'auth_denied' then 1 else 0 end) as auth_denied_count,
         sum(case when event_type in ('blocked_autobook', 'blocked_autobook_rest') then 1 else 0 end) as blocked_autobook_count,
         sum(case when event_type = 'telephony_ai_fallback' then 1 else 0 end) as telephony_fallback_count
       from ai_guardrail_events
       where created_at >= datetime('now', ?)
       group by ${groupExpr}
       order by hour_utc desc
       limit ?`
    )
    .all(rangeInterval, safeLimit)
    .reverse()
    .map((row) => ({
      hourUtc: row.hour_utc,
      authDeniedCount: row.auth_denied_count ?? 0,
      blockedAutobookCount: row.blocked_autobook_count ?? 0,
      telephonyFallbackCount: row.telephony_fallback_count ?? 0,
    }));

  const recentCalls = db
    .prepare<unknown[], CallRow>(
      `select
         id,
         external_call_id,
         phone_number,
         channel,
         started_at,
         ended_at,
         duration_seconds,
         disposition,
         escalation_reason,
         priority_score
       from calls
       order by started_at desc
       limit ?`
    )
    .all(safeLimit)
    .map((row) => ({
      id: row.id,
      externalCallId: row.external_call_id ?? undefined,
      phoneNumber: row.phone_number,
      channel: row.channel,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      durationSeconds: row.duration_seconds ?? undefined,
      disposition: row.disposition ?? undefined,
      escalationReason: row.escalation_reason ?? undefined,
      priorityScore: row.priority_score,
    }));

  const callbackQueue = db
    .prepare<unknown[], CallbackRow>(
      `select
         id,
         call_id,
         queue_name,
         priority,
         status,
         reason,
         created_at,
         due_at
       from callback_tasks
       where status in ('open', 'in_progress')
       order by
         case priority
           when 'urgent' then 1
           when 'high' then 2
           when 'normal' then 3
           else 4
         end,
         created_at asc
       limit ?`
    )
    .all(safeLimit)
    .map((row) => ({
      id: row.id,
      callId: row.call_id ?? undefined,
      queueName: row.queue_name,
      priority: row.priority,
      status: row.status,
      reason: row.reason,
      createdAt: row.created_at,
      dueAt: row.due_at ?? undefined,
    }));

  const recentTelephonyEvents = db
    .prepare<unknown[], WebhookEventRow>(
      `select provider, event_key, call_id, response_code, created_at
       from telephony_webhook_events
       order by created_at desc
       limit ?`
    )
    .all(safeLimit)
    .map((row) => ({
      provider: row.provider,
      eventKey: row.event_key,
      callId: row.call_id ?? undefined,
      responseCode: row.response_code,
      createdAt: row.created_at,
    }));

  return {
    generatedAt: new Date().toISOString(),
    range: {
      key: rangeKey,
      hours: rangeHours,
    },
    summary: {
      callsInRange,
      openCallbacks,
      authDeniedInRange,
      blockedAutobookInRange,
      telephonyFallbacksInRange,
      telephonyEventsInRange,
    },
    trends,
    recentCalls,
    callbackQueue,
    recentTelephonyEvents,
  };
}
