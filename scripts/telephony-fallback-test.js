const assert = require('node:assert/strict');
const { planTelephonyAiFallback } = require('../dist/services/telephonyFallback.js');

function run() {
  const booked = planTelephonyAiFallback('booked');
  assert.equal(booked.overwriteDisposition, false);
  assert.equal(booked.createCallback, false);
  assert.match(booked.message, /appointment is booked/i);

  const escalated = planTelephonyAiFallback('escalated');
  assert.equal(escalated.overwriteDisposition, false);
  assert.equal(escalated.createCallback, false);
  assert.match(escalated.message, /alerted our team/i);

  const existingCallback = planTelephonyAiFallback('callback_scheduled');
  assert.equal(existingCallback.overwriteDisposition, false);
  assert.equal(existingCallback.createCallback, false);

  const fresh = planTelephonyAiFallback(null);
  assert.equal(fresh.overwriteDisposition, true);
  assert.equal(fresh.createCallback, true);
  assert.match(fresh.message, /call you back/i);

  const unknown = planTelephonyAiFallback('completed');
  assert.equal(unknown.overwriteDisposition, true);
  assert.equal(unknown.createCallback, true);

  console.log('[PASS] telephony fallback preserves completed dispositions');
}

run();
