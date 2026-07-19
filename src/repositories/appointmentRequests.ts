import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { AppointmentRequest, AppointmentRequestStatus, CreateAppointmentRequestInput, ServiceChannel, Urgency } from '../types';

interface AppointmentRequestRow {
  id: string;
  call_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  service_channel: string;
  requested_service: string | null;
  concern_category: string | null;
  symptom_summary: string | null;
  urgency: string;
  drivable: number | null;
  tow_needed: number;
  preferred_date: string | null;
  preferred_time_window: string | null;
  requested_location_id: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toAppointmentRequest(row: AppointmentRequestRow): AppointmentRequest {
  return {
    id: row.id,
    callId: row.call_id ?? undefined,
    customerId: row.customer_id ?? undefined,
    vehicleId: row.vehicle_id ?? undefined,
    serviceChannel: row.service_channel as ServiceChannel,
    requestedService: row.requested_service ?? undefined,
    concernCategory: row.concern_category ?? undefined,
    symptomSummary: row.symptom_summary ?? undefined,
    urgency: row.urgency as Urgency,
    drivable: row.drivable === null ? undefined : !!row.drivable,
    towNeeded: !!row.tow_needed,
    preferredDate: row.preferred_date ?? undefined,
    preferredTimeWindow: row.preferred_time_window ?? undefined,
    requestedLocationId: row.requested_location_id ?? undefined,
    status: row.status as AppointmentRequestStatus,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAppointmentRequestById(id: string): AppointmentRequest | undefined {
  const row = db.prepare<[string], AppointmentRequestRow>('select * from appointment_requests where id = ?').get(id);
  return row ? toAppointmentRequest(row) : undefined;
}

export function createAppointmentRequest(
  input: CreateAppointmentRequestInput & { status: AppointmentRequestStatus }
): AppointmentRequest {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `insert into appointment_requests
       (id, call_id, customer_id, vehicle_id, service_channel, requested_service, concern_category, symptom_summary,
        urgency, drivable, tow_needed, preferred_date, preferred_time_window, status, created_by, created_at, updated_at)
     values
       (@id, @callId, @customerId, @vehicleId, @serviceChannel, @requestedService, @concernCategory, @symptomSummary,
        @urgency, @drivable, @towNeeded, @preferredDate, @preferredTimeWindow, @status, 'ai_agent', @createdAt, @updatedAt)`
  ).run({
    id,
    callId: input.callId ?? null,
    customerId: input.customerId ?? null,
    vehicleId: input.vehicleId ?? null,
    serviceChannel: input.serviceChannel,
    requestedService: input.requestedService ?? null,
    concernCategory: input.concernCategory ?? null,
    symptomSummary: input.symptomSummary ?? null,
    urgency: input.urgency,
    drivable: input.drivable === undefined ? null : input.drivable ? 1 : 0,
    towNeeded: input.towNeeded ? 1 : 0,
    preferredDate: input.preferredDate ?? null,
    preferredTimeWindow: input.preferredTimeWindow ?? null,
    status: input.status,
    createdAt: now,
    updatedAt: now,
  });
  return getAppointmentRequestById(id)!;
}

export function updateAppointmentRequestStatus(id: string, status: AppointmentRequestStatus): AppointmentRequest | undefined {
  db.prepare('update appointment_requests set status = ?, updated_at = ? where id = ?').run(status, new Date().toISOString(), id);
  return getAppointmentRequestById(id);
}
