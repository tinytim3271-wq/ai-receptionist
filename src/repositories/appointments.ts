import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { Appointment, AppointmentStatus, ServiceChannel } from '../types';

interface AppointmentRow {
  id: string;
  appointment_request_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  service_channel: string;
  scheduled_start: string;
  scheduled_end: string | null;
  service_type: string;
  bay_id: string | null;
  mobile_unit_id: string | null;
  advisor_id: string | null;
  source: string;
  confirmation_status: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    appointmentRequestId: row.appointment_request_id ?? undefined,
    customerId: row.customer_id ?? undefined,
    vehicleId: row.vehicle_id ?? undefined,
    serviceChannel: row.service_channel as ServiceChannel,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end ?? undefined,
    serviceType: row.service_type,
    bayId: row.bay_id ?? undefined,
    mobileUnitId: row.mobile_unit_id ?? undefined,
    advisorId: row.advisor_id ?? undefined,
    source: row.source,
    confirmationStatus: row.confirmation_status as Appointment['confirmationStatus'],
    status: row.status as AppointmentStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAppointmentById(id: string): Appointment | undefined {
  const row = db.prepare<[string], AppointmentRow>('select * from appointments where id = ?').get(id);
  return row ? toAppointment(row) : undefined;
}

export function listAppointmentsBetween(startIso: string, endIso: string): Appointment[] {
  const rows = db
    .prepare<[string, string], AppointmentRow>(
      `select * from appointments
       where scheduled_start >= ? and scheduled_start < ?
         and status not in ('cancelled', 'no_show')`
    )
    .all(startIso, endIso);
  return rows.map(toAppointment);
}

export interface CreateAppointmentInput {
  appointmentRequestId?: string;
  customerId?: string;
  vehicleId?: string;
  serviceChannel: ServiceChannel;
  scheduledStart: string;
  scheduledEnd?: string;
  serviceType: string;
}

export function createAppointment(input: CreateAppointmentInput): Appointment {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `insert into appointments
       (id, appointment_request_id, customer_id, vehicle_id, service_channel, scheduled_start, scheduled_end,
        service_type, source, confirmation_status, status, created_at, updated_at)
     values
       (@id, @appointmentRequestId, @customerId, @vehicleId, @serviceChannel, @scheduledStart, @scheduledEnd,
        @serviceType, 'ai_receptionist', 'pending', 'scheduled', @createdAt, @updatedAt)`
  ).run({
    id,
    appointmentRequestId: input.appointmentRequestId ?? null,
    customerId: input.customerId ?? null,
    vehicleId: input.vehicleId ?? null,
    serviceChannel: input.serviceChannel,
    scheduledStart: input.scheduledStart,
    scheduledEnd: input.scheduledEnd ?? null,
    serviceType: input.serviceType,
    createdAt: now,
    updatedAt: now,
  });
  return getAppointmentById(id)!;
}
