const { createHmac } = require('node:crypto');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TWILIO_TOKEN = process.env.TELEPHONY_TWILIO_AUTH_TOKEN || 'telephony-test-token';

function sign(url, params) {
  const sortedKeys = Object.keys(params).sort();
  let payload = url;
  for (const key of sortedKeys) {
    payload += key + String(params[key] ?? '');
  }
  return createHmac('sha1', TWILIO_TOKEN).update(payload, 'utf8').digest('base64');
}

function assert(condition, label, details) {
  if (!condition) {
    console.error(`[FAIL] ${label}${details ? `: ${details}` : ''}`);
    throw new Error(label);
  }
  console.log(`[PASS] ${label}${details ? `: ${details}` : ''}`);
}

async function postForm(path, params, includeSignature = true) {
  const url = `${BASE_URL}${path}`;
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    body.set(k, String(v));
  }

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (includeSignature) {
    headers['X-Twilio-Signature'] = sign(url, params);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  const text = await response.text();
  return { status: response.status, text };
}

async function run() {
  const callSid = `CA${Date.now()}1234`;
  const from = '+15555550123';

  const badSig = await postForm(
    '/api/telephony/twilio/voice/start',
    { CallSid: callSid, From: from, CallStatus: 'in-progress' },
    false
  );
  assert(badSig.status === 401, 'Telephony start without signature returns 401', `status=${badSig.status}`);

  const start = await postForm('/api/telephony/twilio/voice/start', {
    CallSid: callSid,
    From: from,
    CallStatus: 'in-progress',
    RequestSid: `RQ${Date.now()}1`,
  });
  assert(start.status === 200, 'Telephony start returns 200', `status=${start.status}`);
  assert(start.text.includes('<Gather'), 'Telephony start returns Gather TwiML');

  const turnParams = {
    CallSid: callSid,
    From: from,
    SpeechResult: 'I need an oil change this week',
    Confidence: '0.88',
    RequestSid: `RQ${Date.now()}2`,
  };
  const turn1 = await postForm('/api/telephony/twilio/voice/turn', turnParams);
  assert(turn1.status === 200, 'Telephony turn returns 200', `status=${turn1.status}`);
  assert(turn1.text.includes('<Response>'), 'Telephony turn returns TwiML response body');

  const turnDup = await postForm('/api/telephony/twilio/voice/turn', turnParams);
  assert(turnDup.status === 200, 'Duplicate telephony turn returns 200', `status=${turnDup.status}`);
  assert(turnDup.text === turn1.text, 'Duplicate telephony turn returns cached response');

  const end = await postForm('/api/telephony/twilio/voice/end', {
    CallSid: callSid,
    CallStatus: 'completed',
    RequestSid: `RQ${Date.now()}3`,
  });
  assert(end.status === 200, 'Telephony end returns 200', `status=${end.status}`);
  assert(end.text.includes('<Hangup/>'), 'Telephony end returns hangup TwiML');

  console.log('\nTelephony webhook test passed.');
}

run().catch((err) => {
  console.error('Telephony test error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
