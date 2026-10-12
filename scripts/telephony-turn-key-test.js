const assert = require('node:assert/strict');
const {
  buildTelephonyEventKey,
  buildTwimlGather,
  extractTurnId,
} = require('../dist/services/telephonyTwiml.js');

function run() {
  const bodyYes = {
    CallSid: 'CA123',
    From: '+15555550123',
    SpeechResult: 'yes',
    Confidence: '1.0',
  };

  const firstTurn = buildTelephonyEventKey('turn', bodyYes, 'turn-aaa');
  const secondTurn = buildTelephonyEventKey('turn', bodyYes, 'turn-bbb');
  assert.notEqual(
    firstTurn,
    secondTurn,
    'identical SpeechResult with different turnIds must not share an event key'
  );

  const retrySameTurn = buildTelephonyEventKey('turn', bodyYes, 'turn-aaa');
  assert.equal(retrySameTurn, firstTurn, 'Twilio retry of the same Gather action must reuse the key');

  const legacyFingerprintA = buildTelephonyEventKey('turn', bodyYes);
  const legacyFingerprintB = buildTelephonyEventKey('turn', bodyYes);
  assert.equal(
    legacyFingerprintA,
    legacyFingerprintB,
    'legacy fingerprint (no turnId / RequestSid) remains stable for true retries'
  );

  const withRequestSid = buildTelephonyEventKey('turn', { ...bodyYes, RequestSid: 'RQ1' }, 'turn-ignored');
  assert.equal(withRequestSid, 'CA123:turn:RQ1');

  const gather = buildTwimlGather('Book Tuesday at 2?', 'turn-fixed');
  assert.match(gather, /action="\/api\/telephony\/twilio\/voice\/turn\?turnId=turn-fixed"/);
  assert.match(gather, /<Redirect method="POST">\/api\/telephony\/twilio\/voice\/turn\?turnId=turn-fixed<\/Redirect>/);
  assert.match(gather, /Book Tuesday at 2\?/);

  assert.equal(extractTurnId({ turnId: 'abc' }), 'abc');
  assert.equal(extractTurnId({ turnId: ['xyz'] }), 'xyz');
  assert.equal(extractTurnId({}), undefined);

  const uniqueA = buildTwimlGather('one');
  const uniqueB = buildTwimlGather('one');
  const turnIdA = uniqueA.match(/turnId=([^"]+)/)?.[1];
  const turnIdB = uniqueB.match(/turnId=([^"]+)/)?.[1];
  assert.ok(turnIdA && turnIdB);
  assert.notEqual(turnIdA, turnIdB, 'each Gather must mint a fresh turnId by default');

  console.log('[PASS] telephony turn keys distinguish identical SpeechResult turns');
}

run();
