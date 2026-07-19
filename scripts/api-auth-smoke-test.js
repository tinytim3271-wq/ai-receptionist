const path = require('node:path');
const Database = require('better-sqlite3');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TOKEN = process.env.AI_API_BEARER_TOKEN;
const WRONG_TOKEN = process.env.WRONG_API_BEARER_TOKEN || 'definitely-wrong-token';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'receptionist.db');

if (!TOKEN) {
  console.error('AI_API_BEARER_TOKEN is required.');
  process.exit(1);
}

function logResult(ok, label, details) {
  const state = ok ? 'PASS' : 'FAIL';
  console.log(`[${state}] ${label}${details ? `: ${details}` : ''}`);
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function run() {
  const startedAt = new Date().toISOString();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const uniqueSuffix = Date.now();
  let failed = false;
  const authHeaders = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };

  const noAuth = await requestJson(`${BASE_URL}/api/ai/policy`, { method: 'GET' });
  const noAuthOk = noAuth.status === 401;
  logResult(noAuthOk, 'GET /api/ai/policy without auth returns 401', `status=${noAuth.status}`);
  failed ||= !noAuthOk;

  const badAuth = await requestJson(`${BASE_URL}/api/ai/policy`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${WRONG_TOKEN}` },
  });
  const badAuthOk = badAuth.status === 403;
  logResult(badAuthOk, 'GET /api/ai/policy with wrong token returns 403', `status=${badAuth.status}`);
  failed ||= !badAuthOk;

  const blocked = await requestJson(`${BASE_URL}/api/ai/appointments`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      callId: 'smoke-test-call-id',
      customerId: 'smoke-test-customer-id',
      vehicleId: 'smoke-test-vehicle-id',
      serviceChannel: 'shop',
      scheduledStart: tomorrow,
      serviceType: 'transmission rebuild',
    }),
  });
  const blockedOk = blocked.status === 403;
  logResult(blockedOk, 'POST /api/ai/appointments with disallowed service returns 403', `status=${blocked.status}`);
  failed ||= !blockedOk;

  const customer = await requestJson(`${BASE_URL}/api/ai/customers`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      firstName: 'Smoke',
      lastName: 'Tester',
      phone: `555-200-${String(uniqueSuffix).slice(-4)}`,
      email: 'smoke@test.local',
    }),
  });
  const createCustomerOk = customer.status === 201 && customer.body?.id;
  logResult(
    !!createCustomerOk,
    'POST /api/ai/customers returns 201',
    `status=${customer.status}${customer.body?.id ? ` id=${customer.body.id}` : ''}`
  );
  failed ||= !createCustomerOk;

  const customerId = customer.body?.id;
  const vehicle = await requestJson(`${BASE_URL}/api/ai/vehicles`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      customerId,
      year: 2018,
      make: 'Honda',
      model: 'Civic',
      mileage: 88000,
    }),
  });
  const createVehicleOk = vehicle.status === 201 && vehicle.body?.id;
  logResult(
    !!createVehicleOk,
    'POST /api/ai/vehicles returns 201',
    `status=${vehicle.status}${vehicle.body?.id ? ` id=${vehicle.body.id}` : ''}`
  );
  failed ||= !createVehicleOk;

  const appointmentAllowed = await requestJson(`${BASE_URL}/api/ai/appointments`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      customerId,
      vehicleId: vehicle.body?.id,
      serviceChannel: 'shop',
      scheduledStart: tomorrow,
      serviceType: 'oil change',
    }),
  });
  const allowedOk = appointmentAllowed.status === 201 && appointmentAllowed.body?.id;
  logResult(
    !!allowedOk,
    'POST /api/ai/appointments with allowed service returns 201',
    `status=${appointmentAllowed.status}${appointmentAllowed.body?.id ? ` id=${appointmentAllowed.body.id}` : ''}`
  );
  failed ||= !allowedOk;

  const db = new Database(DB_PATH, { readonly: true });
  const authDeniedCount = db
    .prepare(
      `select count(*) as count
       from ai_guardrail_events
       where event_type = 'auth_denied' and created_at >= ?`
    )
    .get(startedAt).count;

  const blockedRestCount = db
    .prepare(
      `select count(*) as count
       from ai_guardrail_events
       where event_type = 'blocked_autobook_rest' and created_at >= ?`
    )
    .get(startedAt).count;

  db.close();

  const authAuditOk = authDeniedCount >= 2;
  logResult(authAuditOk, 'Guardrail logged auth_denied events', `count=${authDeniedCount}`);
  failed ||= !authAuditOk;

  const blockedAuditOk = blockedRestCount >= 1;
  logResult(blockedAuditOk, 'Guardrail logged blocked_autobook_rest event', `count=${blockedRestCount}`);
  failed ||= !blockedAuditOk;

  if (failed) {
    console.error('\nSmoke test failed. Ensure server is running and token is correct.');
    process.exit(1);
  }

  console.log('\nAuth + booking smoke test passed.');
}

run().catch((err) => {
  console.error('Smoke test error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});