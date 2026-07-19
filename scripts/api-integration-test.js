const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TOKEN = process.env.AI_API_BEARER_TOKEN;

if (!TOKEN) {
  console.error('AI_API_BEARER_TOKEN is required.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

function pass(label, details) {
  console.log(`[PASS] ${label}${details ? `: ${details}` : ''}`);
}

function fail(label, details) {
  console.error(`[FAIL] ${label}${details ? `: ${details}` : ''}`);
}

function assert(condition, label, details) {
  if (!condition) {
    fail(label, details);
    throw new Error(label);
  }
  pass(label, details);
}

async function requestJson(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

async function run() {
  const uniqueSuffix = Date.now();

  const policy = await requestJson('/api/ai/policy', { method: 'GET', headers });
  assert(policy.status === 200, 'GET /api/ai/policy returns 200', `status=${policy.status}`);
  assert(policy.body && typeof policy.body === 'object', 'Policy payload is object');

  const lookup = await requestJson('/api/ai/customers/lookup?phone=555-999-1000', {
    method: 'GET',
    headers,
  });
  assert(lookup.status === 200, 'GET /api/ai/customers/lookup returns 200', `status=${lookup.status}`);
  assert(typeof lookup.body?.found === 'boolean', 'Lookup response has boolean found');

  const customer = await requestJson('/api/ai/customers', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      firstName: 'Integration',
      lastName: 'Tester',
      phone: `555-300-${String(uniqueSuffix).slice(-4)}`,
      email: 'integration@test.local',
    }),
  });
  assert(customer.status === 201, 'POST /api/ai/customers returns 201', `status=${customer.status}`);
  assert(typeof customer.body?.id === 'string' && customer.body.id.length > 0, 'Customer response includes id');

  const normalizedLookup = await requestJson(`/api/ai/customers/lookup?phone=${encodeURIComponent(`(555) 300-${String(uniqueSuffix).slice(-4)}`)}`, {
    method: 'GET',
    headers,
  });
  assert(normalizedLookup.status === 200, 'GET /api/ai/customers/lookup with different phone format returns 200', `status=${normalizedLookup.status}`);
  assert(normalizedLookup.body?.found === true, 'Cross-format phone lookup resolves existing customer');
  assert(normalizedLookup.body?.customer?.id === customer.body.id, 'Cross-format lookup returns matching customer id');

  const vehicle = await requestJson('/api/ai/vehicles', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customerId: customer.body.id,
      year: 2020,
      make: 'Toyota',
      model: 'Corolla',
      mileage: 65000,
    }),
  });
  assert(vehicle.status === 201, 'POST /api/ai/vehicles returns 201', `status=${vehicle.status}`);
  assert(typeof vehicle.body?.id === 'string' && vehicle.body.id.length > 0, 'Vehicle response includes id');
  assert(vehicle.body?.customerId === customer.body.id, 'Vehicle references created customer');

  const availability = await requestJson('/api/ai/availability/check', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      serviceType: 'oil change',
      serviceChannel: 'shop',
      requestedDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      preferredTimeWindow: 'morning',
    }),
  });
  assert(availability.status === 200, 'POST /api/ai/availability/check returns 200', `status=${availability.status}`);
  assert(typeof availability.body?.bookable === 'boolean', 'Availability response has boolean bookable');
  assert(Array.isArray(availability.body?.slots), 'Availability response has slots array');

  const disallowed = await requestJson('/api/ai/appointments', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customerId: customer.body.id,
      vehicleId: vehicle.body.id,
      serviceChannel: 'shop',
      scheduledStart: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      serviceType: 'engine rebuild',
    }),
  });
  assert(disallowed.status === 403, 'POST /api/ai/appointments disallowed service returns 403', `status=${disallowed.status}`);
  assert(Array.isArray(disallowed.body?.approvedServices), 'Disallowed response returns approvedServices array');

  const allowed = await requestJson('/api/ai/appointments', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customerId: customer.body.id,
      vehicleId: vehicle.body.id,
      serviceChannel: 'shop',
      scheduledStart: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
      serviceType: 'oil change',
    }),
  });
  assert(allowed.status === 201, 'POST /api/ai/appointments allowed service returns 201', `status=${allowed.status}`);
  assert(typeof allowed.body?.id === 'string' && allowed.body.id.length > 0, 'Allowed appointment response includes id');
  assert(allowed.body?.serviceType === 'oil change', 'Allowed appointment preserves requested service type');
  assert(isIsoDate(allowed.body?.scheduledStart), 'Allowed appointment has ISO scheduledStart');

  console.log('\nIntegration API test passed.');
}

run().catch((err) => {
  console.error('Integration test error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
