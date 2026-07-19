import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { CallbackPriority, CallbackTask } from '../types';

interface CallbackTaskRow {
  id: string;
  call_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  reason: string;
  queue_name: string;
  priority: string;
  due_at: string | null;
  assigned_to: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toCallbackTask(row: CallbackTaskRow): CallbackTask {
  return {
    id: row.id,
    callId: row.call_id ?? undefined,
    customerId: row.customer_id ?? undefined,
    vehicleId: row.vehicle_id ?? undefined,
    reason: row.reason,
    queueName: row.queue_name,
    priority: row.priority as CallbackPriority,
    dueAt: row.due_at ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    status: row.status as CallbackTask['status'],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getCallbackTaskById(id: string): CallbackTask | undefined {
  const row = db.prepare<[string], CallbackTaskRow>('select * from callback_tasks where id = ?').get(id);
  return row ? toCallbackTask(row) : undefined;
}

export interface CreateCallbackTaskInput {
  callId?: string;
  customerId?: string;
  vehicleId?: string;
  reason: string;
  queueName: string;
  priority: CallbackPriority;
  dueAt?: string;
}

export function createCallbackTask(input: CreateCallbackTaskInput): CallbackTask {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `insert into callback_tasks
       (id, call_id, customer_id, vehicle_id, reason, queue_name, priority, due_at, status, created_by, created_at, updated_at)
     values
       (@id, @callId, @customerId, @vehicleId, @reason, @queueName, @priority, @dueAt, 'open', 'ai_agent', @createdAt, @updatedAt)`
  ).run({
    id,
    callId: input.callId ?? null,
    customerId: input.customerId ?? null,
    vehicleId: input.vehicleId ?? null,
    reason: input.reason,
    queueName: input.queueName,
    priority: input.priority,
    dueAt: input.dueAt ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return getCallbackTaskById(id)!;
}
