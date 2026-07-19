# Operations SQL Query Pack

These queries are designed for the local SQLite database at `data/receptionist.db`.

## 1) Auth Denial Trend (hourly, last 24h)

```sql
select
  substr(created_at, 1, 13) as hour_utc,
  count(*) as auth_denied_count
from ai_guardrail_events
where event_type = 'auth_denied'
  and created_at >= datetime('now', '-1 day')
group by substr(created_at, 1, 13)
order by hour_utc;
```

## 2) Blocked Auto-book Trend (hourly, last 24h)

```sql
select
  substr(created_at, 1, 13) as hour_utc,
  count(*) as blocked_autobook_count
from ai_guardrail_events
where event_type in ('blocked_autobook', 'blocked_autobook_rest')
  and created_at >= datetime('now', '-1 day')
group by substr(created_at, 1, 13)
order by hour_utc;
```

## 3) Escalation and Callback Volume (daily, last 14d)

```sql
select
  substr(created_at, 1, 10) as day_utc,
  sum(case when event_type = 'escalation' then 1 else 0 end) as escalations,
  sum(case when event_type = 'telephony_ai_fallback' then 1 else 0 end) as ai_fallbacks
from ai_guardrail_events
where created_at >= datetime('now', '-14 day')
group by substr(created_at, 1, 10)
order by day_utc;
```

```sql
select
  substr(created_at, 1, 10) as day_utc,
  count(*) as callback_tasks_created
from callback_tasks
where created_at >= datetime('now', '-14 day')
group by substr(created_at, 1, 10)
order by day_utc;
```

## 4) Call Outcomes Snapshot (last 100 calls)

```sql
select
  id,
  external_call_id,
  phone_number,
  started_at,
  ended_at,
  duration_seconds,
  disposition,
  escalation_reason,
  priority_score
from calls
order by started_at desc
limit 100;
```

## 5) Duplicate/Replayed Telephony Events

```sql
select
  provider,
  event_key,
  call_id,
  response_code,
  created_at
from telephony_webhook_events
order by created_at desc
limit 100;
```

## 6) Health Check: 5xx Proxy Signal

This app does not store HTTP status codes in SQLite by default. Use structured logs (`event=http_request`) to compute 5xx rates.

Quick approximation from guardrails and fallback markers:

```sql
select
  substr(created_at, 1, 13) as hour_utc,
  sum(case when severity = 'critical' then 1 else 0 end) as critical_events,
  sum(case when event_type = 'telephony_ai_fallback' then 1 else 0 end) as telephony_fallbacks
from ai_guardrail_events
where created_at >= datetime('now', '-1 day')
group by substr(created_at, 1, 13)
order by hour_utc;
```
