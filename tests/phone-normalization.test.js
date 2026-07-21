const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePhone } = require('../dist/utils/phone.js');

test('normalizePhone normalizes common US formats', () => {
  assert.equal(normalizePhone('555-123-4567'), '+15551234567');
  assert.equal(normalizePhone('(555) 123-4567'), '+15551234567');
  assert.equal(normalizePhone('1 (555) 123-4567'), '+15551234567');
});

test('normalizePhone keeps short extension-like values', () => {
  assert.equal(normalizePhone('1234'), '1234');
});

test('normalizePhone converts international 00 prefix', () => {
  assert.equal(normalizePhone('00442071234567'), '+442071234567');
});

test('normalizePhone preserves plus-prefixed values as canonical digits', () => {
  assert.equal(normalizePhone('+44 20 7123 4567'), '+442071234567');
});
