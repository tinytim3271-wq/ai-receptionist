import type OpenAI from 'openai';

// Guardrail by construction: prohibited actions (invoice.update, estimate.finalize,
// work_order.close, refund.create, discount.override) have no tool here, so the
// model cannot invoke them at all.
export const receptionistTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'lookup_customer',
      description: 'Look up an existing customer and their vehicles by phone number.',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Customer phone number' },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_customer',
      description: 'Create a new customer record once you have their name and callback number.',
      parameters: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['firstName', 'phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_vehicle',
      description: 'Create a vehicle record for a customer.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'string' },
          year: { type: 'integer' },
          make: { type: 'string' },
          model: { type: 'string' },
          trim: { type: 'string' },
          mileage: { type: 'integer' },
        },
        required: ['customerId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Check open appointment slots for a service on a date. Must be called before offering any time slot.',
      parameters: {
        type: 'object',
        properties: {
          serviceType: { type: 'string', description: 'Requested service, e.g. "oil change"' },
          serviceChannel: { type: 'string', enum: ['shop', 'mobile'] },
          requestedDate: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          preferredTimeWindow: { type: 'string', description: 'e.g. "morning" or "afternoon"' },
        },
        required: ['serviceType', 'serviceChannel', 'requestedDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_appointment_request',
      description:
        'Record a structured appointment request. Use for every service inquiry, including ones that need a human callback.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'string' },
          vehicleId: { type: 'string' },
          serviceChannel: { type: 'string', enum: ['shop', 'mobile'] },
          requestedService: { type: 'string' },
          concernCategory: { type: 'string' },
          symptomSummary: { type: 'string' },
          urgency: { type: 'string', enum: ['low', 'normal', 'high', 'emergency'] },
          drivable: { type: 'boolean' },
          towNeeded: { type: 'boolean' },
          preferredDate: { type: 'string', description: 'YYYY-MM-DD' },
          preferredTimeWindow: { type: 'string' },
        },
        required: ['serviceChannel', 'urgency'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_appointment',
      description:
        'Book a confirmed appointment. Only allowed for approved auto-book services after check_availability returned an open slot the customer accepted.',
      parameters: {
        type: 'object',
        properties: {
          appointmentRequestId: { type: 'string' },
          customerId: { type: 'string' },
          vehicleId: { type: 'string' },
          serviceChannel: { type: 'string', enum: ['shop', 'mobile'] },
          scheduledStart: { type: 'string', description: 'ISO date-time of the accepted slot start' },
          scheduledEnd: { type: 'string', description: 'ISO date-time of the accepted slot end' },
          serviceType: { type: 'string' },
        },
        required: ['customerId', 'vehicleId', 'serviceChannel', 'scheduledStart', 'serviceType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_callback_task',
      description:
        'Create a callback task for staff. Use for complex estimates, job status questions, warranty/insurance, complaints, or anything you cannot handle.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'string' },
          vehicleId: { type: 'string' },
          reason: { type: 'string' },
          queueName: {
            type: 'string',
            enum: ['service_advisor', 'front_desk', 'mobile_dispatch', 'manager'],
          },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
        },
        required: ['reason', 'queueName', 'priority'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate',
      description:
        'Immediately escalate an urgent or unsafe situation to a human. Use for roadside breakdowns, active overheating, tow needed, engine knock, accidents, or angry callers requesting a manager.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Short description of why this is urgent' },
          escalationType: {
            type: 'string',
            enum: ['unsafe_breakdown', 'overheating_now', 'engine_knock', 'tow_needed', 'accident', 'complaint', 'other'],
          },
        },
        required: ['reason', 'escalationType'],
      },
    },
  },
];
