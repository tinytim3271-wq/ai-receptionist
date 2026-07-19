import { Router } from 'express';
import { requireBearerAuth } from '../middleware/bearerAuth';
import { logGuardrailEvent, logInteraction } from '../repositories/aiInteractions';
import { createAppointmentRequest } from '../repositories/appointmentRequests';
import { createAppointment } from '../repositories/appointments';
import { checkAvailability } from '../repositories/availability';
import { getAllActiveRules } from '../repositories/businessRules';
import { createCallbackTask } from '../repositories/callbackTasks';
import { attachTranscript, startCall, updateCall } from '../repositories/calls';
import { createCustomer, findCustomerByPhone } from '../repositories/customers';
import { createVehicle, listVehiclesByCustomer } from '../repositories/vehicles';
import { evaluateAutoBookPolicy } from '../services/bookingPolicy';

// REST surface matching openapi.yaml from the implementation pack.
export const aiRouter = Router();

aiRouter.use(requireBearerAuth);

aiRouter.get('/policy', (_req, res) => {
  const rules = getAllActiveRules();
  const policy: Record<string, unknown> = {};
  for (const rule of rules) {
    policy[rule.ruleKey] = { ruleType: rule.ruleType, ...rule.ruleValue };
  }
  res.json(policy);
});

aiRouter.get('/customers/lookup', (req, res) => {
  const phone = String(req.query.phone ?? '');
  if (!phone) {
    res.status(400).json({ message: 'phone query parameter is required' });
    return;
  }
  const customer = findCustomerByPhone(phone);
  if (!customer) {
    res.json({ found: false });
    return;
  }
  res.json({ found: true, customer, vehicles: listVehiclesByCustomer(customer.id) });
});

aiRouter.post('/customers', (req, res) => {
  const { firstName, phone } = req.body ?? {};
  if (!firstName || !phone) {
    res.status(400).json({ message: 'firstName and phone are required' });
    return;
  }
  const customer = createCustomer(req.body);
  res.status(201).json(customer);
});

aiRouter.post('/vehicles', (req, res) => {
  const { customerId } = req.body ?? {};
  if (!customerId) {
    res.status(400).json({ message: 'customerId is required' });
    return;
  }
  const vehicle = createVehicle(req.body);
  res.status(201).json(vehicle);
});

aiRouter.post('/calls/start', (req, res) => {
  const { phoneNumber, direction, startedAt, answeredBy } = req.body ?? {};
  if (!phoneNumber || !direction || !startedAt || !answeredBy) {
    res.status(400).json({ message: 'phoneNumber, direction, startedAt, answeredBy are required' });
    return;
  }
  const call = startCall(req.body);
  res.status(201).json(call);
});

aiRouter.patch('/calls/:id', (req, res) => {
  const call = updateCall(req.params.id, req.body ?? {});
  if (!call) {
    res.status(404).json({ message: 'Call not found' });
    return;
  }
  res.json(call);
});

aiRouter.post('/calls/:id/transcript', (req, res) => {
  const { transcript, transcriptSummary } = req.body ?? {};
  if (!transcript || !transcriptSummary) {
    res.status(400).json({ message: 'transcript and transcriptSummary are required' });
    return;
  }
  const call = attachTranscript(req.params.id, transcript, transcriptSummary);
  if (!call) {
    res.status(404).json({ message: 'Call not found' });
    return;
  }
  res.json(call);
});

aiRouter.post('/appointment-requests', (req, res) => {
  const { serviceChannel, urgency } = req.body ?? {};
  if (!serviceChannel || !urgency) {
    res.status(400).json({ message: 'serviceChannel and urgency are required' });
    return;
  }
  const request = createAppointmentRequest({ ...req.body, status: req.body.status ?? 'new' });
  res.status(201).json({ id: request.id, status: request.status });
});

aiRouter.post('/availability/check', (req, res) => {
  const { serviceType, serviceChannel, requestedDate, preferredTimeWindow } = req.body ?? {};
  if (!serviceType || !serviceChannel || !requestedDate) {
    res.status(400).json({ message: 'serviceType, serviceChannel, requestedDate are required' });
    return;
  }
  res.json(checkAvailability(serviceType, serviceChannel, requestedDate, preferredTimeWindow));
});

aiRouter.post('/appointments', (req, res) => {
  const { serviceChannel, scheduledStart, serviceType } = req.body ?? {};
  if (!serviceChannel || !scheduledStart || !serviceType) {
    res.status(400).json({ message: 'serviceChannel, scheduledStart, serviceType are required' });
    return;
  }

  const policy = evaluateAutoBookPolicy(String(serviceType));
  if (!policy.allowed) {
    try {
      logGuardrailEvent({
        eventType: 'blocked_autobook_rest',
        severity: 'warning',
        ruleName: 'auto_book_service',
        rawOutput: {
          serviceType: String(serviceType),
          endpoint: '/api/ai/appointments',
          callId: req.body?.callId ? String(req.body.callId) : undefined,
        },
        actionTaken: 'Rejected appointment creation request with 403',
      });
    } catch {
      // Guardrail logging is best-effort and must not block policy enforcement.
    }
    res.status(403).json({
      message: policy.reason,
      approvedServices: policy.approvedServices,
    });
    return;
  }

  const appointment = createAppointment(req.body);
  res.status(201).json(appointment);
});

aiRouter.post('/callback-tasks', (req, res) => {
  const { reason, queueName, priority } = req.body ?? {};
  if (!reason || !queueName || !priority) {
    res.status(400).json({ message: 'reason, queueName, priority are required' });
    return;
  }
  const task = createCallbackTask(req.body);
  res.status(201).json({ id: task.id, status: task.status });
});

aiRouter.post('/interactions', (req, res) => {
  const { modelName, promptVersion, actionType, actionPayload } = req.body ?? {};
  if (!modelName || !promptVersion || !actionType || !actionPayload) {
    res.status(400).json({ message: 'modelName, promptVersion, actionType, actionPayload are required' });
    return;
  }
  const id = logInteraction(req.body);
  res.status(201).json({ id });
});
