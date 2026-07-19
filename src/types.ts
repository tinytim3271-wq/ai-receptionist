export type ServiceChannel = 'shop' | 'mobile';
export type CallDirection = 'inbound' | 'outbound';
export type AnsweredBy = 'ai' | 'human' | 'voicemail' | 'abandoned';
export type Urgency = 'low' | 'normal' | 'high' | 'emergency';
export type AppointmentRequestStatus = 'new' | 'quoted' | 'booked' | 'needs_callback' | 'declined' | 'duplicate';
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type CallbackPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Customer {
  id: string;
  firstName: string;
  lastName?: string;
  phone: string;
  email?: string;
  marketingOptIn?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Vehicle {
  id: string;
  customerId: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  vin?: string;
  plate?: string;
  mileage?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CallRecord {
  id: string;
  externalCallId?: string;
  customerId?: string;
  vehicleId?: string;
  phoneNumber: string;
  direction: CallDirection;
  channel: 'voice' | 'chat';
  startedAt: string;
  answeredAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  answeredBy: AnsweredBy;
  transferredTo?: string;
  recordingUrl?: string;
  transcript?: string;
  transcriptSummary?: string;
  disposition?: string;
  sentiment?: string;
  priorityScore?: number;
  escalationReason?: string;
  createdAt?: string;
}

export interface AppointmentRequest {
  id: string;
  callId?: string;
  customerId?: string;
  vehicleId?: string;
  serviceChannel: ServiceChannel;
  requestedService?: string;
  concernCategory?: string;
  symptomSummary?: string;
  urgency: Urgency;
  drivable?: boolean;
  towNeeded: boolean;
  preferredDate?: string;
  preferredTimeWindow?: string;
  requestedLocationId?: string;
  status: AppointmentRequestStatus;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Appointment {
  id: string;
  appointmentRequestId?: string;
  customerId?: string;
  vehicleId?: string;
  serviceChannel: ServiceChannel;
  scheduledStart: string;
  scheduledEnd?: string;
  serviceType: string;
  bayId?: string;
  mobileUnitId?: string;
  advisorId?: string;
  source: 'ai_receptionist' | string;
  confirmationStatus: 'pending' | 'sent' | 'confirmed' | 'failed';
  status: AppointmentStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface CallbackTask {
  id: string;
  callId?: string;
  customerId?: string;
  vehicleId?: string;
  reason: string;
  queueName: string;
  priority: CallbackPriority;
  dueAt?: string;
  assignedTo?: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiInteraction {
  id: string;
  callId?: string;
  modelName: string;
  modelVendor?: string;
  promptVersion: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  confidence?: number;
  decisionOutcome?: string;
  approvedByHuman?: boolean;
  approvedBy?: string;
  createdAt?: string;
}

export interface CreateAppointmentRequestInput {
  callId: string;
  customerId?: string;
  vehicleId?: string;
  serviceChannel: ServiceChannel;
  requestedService?: string;
  concernCategory?: string;
  symptomSummary?: string;
  urgency: Urgency;
  drivable?: boolean;
  towNeeded?: boolean;
  preferredDate?: string;
  preferredTimeWindow?: string;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  resourceType: 'bay' | 'mobile_unit' | 'advisor';
}

export interface AvailabilityCheckResponse {
  bookable: boolean;
  slots: AvailabilitySlot[];
}

export interface BusinessRule {
  id: string;
  ruleType: string;
  ruleKey: string;
  ruleValue: Record<string, unknown>;
  active: boolean;
  updatedAt?: string;
}
