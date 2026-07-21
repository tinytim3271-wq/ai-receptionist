import type OpenAI from 'openai';
import { config } from '../config';
import { logGuardrailEvent, logInteraction } from '../repositories/aiInteractions';
import { createAppointmentRequest } from '../repositories/appointmentRequests';
import { createAppointment } from '../repositories/appointments';
import { checkAvailability } from '../repositories/availability';
import { createCallbackTask } from '../repositories/callbackTasks';
import { attachTranscript, getCallById, updateCall } from '../repositories/calls';
import { createCustomer, findCustomerByPhone } from '../repositories/customers';
import { evaluateAutoBookPolicy } from '../services/bookingPolicy';
import { createVehicle, listVehiclesByCustomer } from '../repositories/vehicles';
import type { ServiceChannel, Urgency } from '../types';
import { getOpenAI } from './openaiClient';
import { buildCallStatePrompt, buildPolicyPrompt, buildSystemPrompt, PROMPT_VERSION } from './prompts';
import { receptionistTools } from './tools';

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface SessionEvent {
  type:
    | 'appointment_booked'
    | 'appointment_request_created'
    | 'callback_task_created'
    | 'escalation'
    | 'customer_created'
    | 'vehicle_created'
    | 'guardrail_blocked';
  detail: string;
}

interface CallSession {
  callId: string;
  phoneNumber: string;
  customerId?: string;
  vehicleId?: string;
  messages: ChatMessage[];
  events: SessionEvent[];
}

const sessions = new Map<string, CallSession>();

export function startSession(callId: string, phoneNumber: string): CallSession {
  const customer = findCustomerByPhone(phoneNumber);
  const vehicles = customer ? listVehiclesByCustomer(customer.id) : [];
  const vehicleSummary = vehicles
    .map((v) => [v.year, v.make, v.model].filter(Boolean).join(' '))
    .join('; ');

  const session: CallSession = {
    callId,
    phoneNumber,
    customerId: customer?.id,
    vehicleId: vehicles[0]?.id,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'system', content: buildPolicyPrompt() },
      {
        role: 'system',
        content: buildCallStatePrompt({
          callerPhone: phoneNumber,
          customerFound: !!customer,
          customerName: customer ? `${customer.firstName} ${customer.lastName ?? ''}`.trim() : undefined,
          vehicleSummary: vehicleSummary || undefined,
        }),
      },
    ],
    events: [],
  };

  if (customer) {
    updateCall(callId, { customerId: customer.id });
  }

  sessions.set(callId, session);
  return session;
}

export function getSession(callId: string): CallSession | undefined {
  return sessions.get(callId);
}

export async function handleCallerMessage(
  callId: string,
  text: string
): Promise<{ reply: string; events: SessionEvent[] }> {
  const session = sessions.get(callId);
  if (!session) {
    throw new Error(`No active session for call ${callId}`);
  }

  session.messages.push({ role: 'user', content: text });
  const newEvents: SessionEvent[] = [];
  const openai = getOpenAI();

  for (let round = 0; round < 8; round++) {
    const completion = await openai.chat.completions.create({
      model: config.openaiModel,
      messages: session.messages,
      tools: receptionistTools,
      temperature: 0.4,
    });

    const message = completion.choices[0].message;
    session.messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return { reply: message.content ?? '', events: newEvents };
    }

    for (const toolCall of message.tool_calls) {
      if (!('function' in toolCall)) {
        continue;
      }

      const args = safeParse(toolCall.function.arguments);
      logInteraction({
        callId,
        modelName: config.openaiModel,
        modelVendor: 'openai',
        promptVersion: PROMPT_VERSION,
        actionType: toolCall.function.name,
        actionPayload: args,
      });

      const result = executeTool(session, toolCall.function.name, args, newEvents);
      session.messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    reply: 'Let me have a team member follow up with you directly to make sure this is handled right.',
    events: newEvents,
  };
}

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function executeTool(
  session: CallSession,
  name: string,
  args: Record<string, unknown>,
  events: SessionEvent[]
): Record<string, unknown> {
  try {
    switch (name) {
      case 'lookup_customer': {
        const customer = findCustomerByPhone(String(args.phone ?? session.phoneNumber));
        if (!customer) return { found: false };
        session.customerId = customer.id;
        updateCall(session.callId, { customerId: customer.id });
        return { found: true, customer, vehicles: listVehiclesByCustomer(customer.id) };
      }

      case 'create_customer': {
        const existing = findCustomerByPhone(String(args.phone ?? session.phoneNumber));
        const customer =
          existing ??
          createCustomer({
            firstName: String(args.firstName ?? 'Unknown'),
            lastName: args.lastName ? String(args.lastName) : undefined,
            phone: String(args.phone ?? session.phoneNumber),
            email: args.email ? String(args.email) : undefined,
          });
        session.customerId = customer.id;
        updateCall(session.callId, { customerId: customer.id });
        if (!existing) {
          events.push({ type: 'customer_created', detail: `Customer ${customer.firstName} created` });
        }
        return { customer };
      }

      case 'create_vehicle': {
        const vehicle = createVehicle({
          customerId: String(args.customerId ?? session.customerId ?? ''),
          year: args.year ? Number(args.year) : undefined,
          make: args.make ? String(args.make) : undefined,
          model: args.model ? String(args.model) : undefined,
          trim: args.trim ? String(args.trim) : undefined,
          mileage: args.mileage ? Number(args.mileage) : undefined,
        });
        session.vehicleId = vehicle.id;
        updateCall(session.callId, { vehicleId: vehicle.id });
        events.push({
          type: 'vehicle_created',
          detail: `Vehicle ${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')} added`,
        });
        return { vehicle };
      }

      case 'check_availability': {
        return checkAvailability(
          String(args.serviceType ?? ''),
          (args.serviceChannel as ServiceChannel) ?? 'shop',
          String(args.requestedDate ?? ''),
          args.preferredTimeWindow ? String(args.preferredTimeWindow) : undefined
        ) as unknown as Record<string, unknown>;
      }

      case 'create_appointment_request': {
        const urgency = (args.urgency as Urgency) ?? 'normal';
        const towNeeded = args.towNeeded === true;
        // Rule matrix: urgent/emergency and tow cases are never auto-booked.
        const forceCallback = urgency === 'emergency' || urgency === 'high' || towNeeded;

        const request = createAppointmentRequest({
          callId: session.callId,
          customerId: (args.customerId as string) ?? session.customerId,
          vehicleId: (args.vehicleId as string) ?? session.vehicleId,
          serviceChannel: (args.serviceChannel as ServiceChannel) ?? 'shop',
          requestedService: args.requestedService ? String(args.requestedService) : undefined,
          concernCategory: args.concernCategory ? String(args.concernCategory) : undefined,
          symptomSummary: args.symptomSummary ? String(args.symptomSummary) : undefined,
          urgency,
          drivable: typeof args.drivable === 'boolean' ? args.drivable : undefined,
          towNeeded,
          preferredDate: args.preferredDate ? String(args.preferredDate) : undefined,
          preferredTimeWindow: args.preferredTimeWindow ? String(args.preferredTimeWindow) : undefined,
          status: forceCallback ? 'needs_callback' : 'new',
        });

        events.push({
          type: 'appointment_request_created',
          detail: `Appointment request (${request.requestedService ?? 'service'}, urgency: ${urgency}) recorded`,
        });

        if (forceCallback) {
          const task = createCallbackTask({
            callId: session.callId,
            customerId: session.customerId,
            vehicleId: session.vehicleId,
            reason: `Urgent case: ${request.symptomSummary ?? request.requestedService ?? 'see call'}`,
            queueName: 'service_advisor',
            priority: 'urgent',
          });
          updateCall(session.callId, { priorityScore: 90, escalationReason: 'urgent_intake' });
          events.push({ type: 'callback_task_created', detail: 'Urgent callback task created for the team' });
          logGuardrailEvent({
            callId: session.callId,
            eventType: 'urgent_no_autobook',
            severity: 'warning',
            ruleName: 'urgent_escalation',
            rawOutput: args,
            actionTaken: `Forced needs_callback + urgent callback task ${task.id}`,
          });
          return { appointmentRequest: request, nextAction: 'urgent_callback_created_do_not_book' };
        }

        return { appointmentRequest: request, nextAction: 'ok' };
      }

      case 'create_appointment': {
        const serviceType = String(args.serviceType ?? '');
        const policy = evaluateAutoBookPolicy(serviceType);

        if (!policy.allowed) {
          // Guardrail: only business_rules-approved services can be auto-booked.
          logGuardrailEvent({
            callId: session.callId,
            eventType: 'blocked_autobook',
            severity: 'warning',
            ruleName: 'auto_book_service',
            rawOutput: args,
            actionTaken: 'Rejected booking; instructed model to create callback task instead',
          });
          events.push({
            type: 'guardrail_blocked',
            detail: `Auto-booking blocked for "${serviceType}" (not an approved service)`,
          });
          return {
            error:
              policy.reason ??
              `"${serviceType}" is not approved for auto-booking. Create an appointment request and a callback task instead, and tell the caller a service advisor will confirm the appointment.`,
          };
        }

        const appointment = createAppointment({
          appointmentRequestId: args.appointmentRequestId ? String(args.appointmentRequestId) : undefined,
          customerId: String(args.customerId ?? session.customerId ?? ''),
          vehicleId: String(args.vehicleId ?? session.vehicleId ?? ''),
          serviceChannel: (args.serviceChannel as ServiceChannel) ?? 'shop',
          scheduledStart: String(args.scheduledStart),
          scheduledEnd: args.scheduledEnd ? String(args.scheduledEnd) : undefined,
          serviceType,
        });
        updateCall(session.callId, { disposition: 'booked' });
        events.push({
          type: 'appointment_booked',
          detail: `${serviceType} booked for ${new Date(appointment.scheduledStart).toLocaleString()}`,
        });
        return { appointment };
      }

      case 'create_callback_task': {
        const task = createCallbackTask({
          callId: session.callId,
          customerId: (args.customerId as string) ?? session.customerId,
          vehicleId: (args.vehicleId as string) ?? session.vehicleId,
          reason: String(args.reason ?? 'Follow up requested'),
          queueName: String(args.queueName ?? 'front_desk'),
          priority: (args.priority as 'low' | 'normal' | 'high' | 'urgent') ?? 'normal',
        });
        updateCall(session.callId, { disposition: 'callback_scheduled' });
        events.push({
          type: 'callback_task_created',
          detail: `Callback task created (${task.queueName}, ${task.priority}): ${task.reason}`,
        });
        return { callbackTask: task };
      }

      case 'escalate': {
        const reason = String(args.reason ?? 'Urgent situation');
        updateCall(session.callId, {
          priorityScore: 100,
          escalationReason: String(args.escalationType ?? 'other'),
          disposition: 'escalated',
        });
        const task = createCallbackTask({
          callId: session.callId,
          customerId: session.customerId,
          vehicleId: session.vehicleId,
          reason: `ESCALATION (${args.escalationType}): ${reason}`,
          queueName: args.escalationType === 'complaint' ? 'manager' : 'service_advisor',
          priority: 'urgent',
        });
        events.push({ type: 'escalation', detail: `Escalated to team: ${reason}` });
        logGuardrailEvent({
          callId: session.callId,
          eventType: 'escalation',
          severity: 'critical',
          ruleName: 'urgent_escalation',
          rawOutput: args,
          actionTaken: `Urgent callback task ${task.id} created`,
        });
        return { escalated: true, callbackTask: task };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Tool execution failed' };
  }
}

export async function endSession(callId: string): Promise<void> {
  const session = sessions.get(callId);
  if (!session) return;

  const transcript = session.messages
    .filter((m) => m.role === 'user' || (m.role === 'assistant' && typeof m.content === 'string' && m.content))
    .map((m) => `${m.role === 'user' ? 'Caller' : 'AI'}: ${m.content}`)
    .join('\n');

  let summary = transcript.slice(0, 300);
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: config.openaiModel,
      messages: [
        { role: 'system', content: 'Summarize this auto repair shop call transcript in 2-3 sentences for the service team.' },
        { role: 'user', content: transcript || '(no conversation)' },
      ],
      temperature: 0.2,
    });
    summary = completion.choices[0].message.content ?? summary;
  } catch {
    // keep truncated transcript as fallback summary
  }

  attachTranscript(callId, transcript, summary);
  const call = getCallById(callId);
  if (call) {
    const started = new Date(call.startedAt).getTime();
    updateCall(callId, {
      endedAt: new Date().toISOString(),
      durationSeconds: Math.round((Date.now() - started) / 1000),
    });
  }
  sessions.delete(callId);
}
