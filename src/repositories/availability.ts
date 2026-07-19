import type { AvailabilityCheckResponse, AvailabilitySlot, ServiceChannel } from '../types';
import { listAppointmentsBetween } from './appointments';
import { getServiceDurationMinutes, getShopHours } from './businessRules';

const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Simple single-resource scheduler: one bay for shop work, one mobile unit.
export function checkAvailability(
  serviceType: string,
  serviceChannel: ServiceChannel,
  requestedDate: string,
  preferredTimeWindow?: string
): AvailabilityCheckResponse {
  const date = new Date(`${requestedDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { bookable: false, slots: [] };
  }

  const hours = getShopHours()[dayNames[date.getDay()]];
  if (!hours) {
    return { bookable: false, slots: [] };
  }

  const durationMinutes = getServiceDurationMinutes(serviceType);
  const [openH, openM] = hours[0].split(':').map(Number);
  const [closeH, closeM] = hours[1].split(':').map(Number);

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const existing = listAppointmentsBetween(dayStart.toISOString(), dayEnd.toISOString()).filter(
    (appt) => appt.serviceChannel === serviceChannel
  );

  const slots: AvailabilitySlot[] = [];
  const cursor = new Date(date);
  cursor.setHours(openH, openM, 0, 0);
  const close = new Date(date);
  close.setHours(closeH, closeM, 0, 0);
  const now = new Date();

  while (cursor.getTime() + durationMinutes * 60_000 <= close.getTime()) {
    const slotStart = new Date(cursor);
    const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000);

    const overlaps = existing.some((appt) => {
      const apptStart = new Date(appt.scheduledStart).getTime();
      const apptEnd = appt.scheduledEnd
        ? new Date(appt.scheduledEnd).getTime()
        : apptStart + 60 * 60_000;
      return slotStart.getTime() < apptEnd && slotEnd.getTime() > apptStart;
    });

    if (!overlaps && slotStart.getTime() > now.getTime()) {
      slots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        resourceType: serviceChannel === 'mobile' ? 'mobile_unit' : 'bay',
      });
    }

    cursor.setMinutes(cursor.getMinutes() + durationMinutes);
  }

  const filtered = filterByTimeWindow(slots, preferredTimeWindow);
  return { bookable: filtered.length > 0, slots: filtered.slice(0, 5) };
}

function filterByTimeWindow(slots: AvailabilitySlot[], window?: string): AvailabilitySlot[] {
  if (!window) return slots;
  const lower = window.toLowerCase();
  if (lower.includes('morning')) {
    return slots.filter((s) => new Date(s.start).getHours() < 12);
  }
  if (lower.includes('afternoon')) {
    return slots.filter((s) => new Date(s.start).getHours() >= 12);
  }
  return slots;
}
