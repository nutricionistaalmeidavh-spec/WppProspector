'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { licenseStatus } = require('./license.cjs');
const testLicense = readFileSync(join(__dirname, 'test-fixtures','signed-trial.txt'), 'utf8').trim();
const trialStart = new Date('2026-09-25T00:00:00Z');

test('accepts a properly signed and unexpired trial', () => {
  const result = licenseStatus(testLicense, trialStart);
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'trial');
});
test('rejects a changed signature', () => {
  const parts = testLicense.split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  assert.equal(licenseStatus(parts.join('.'), trialStart).ok, false);
});
test('rejects expiration and a future activation date', () => {
  assert.equal(licenseStatus(testLicense, new Date('2026-10-01T00:00:00Z')).reason, 'expired');
  assert.equal(licenseStatus(testLicense, new Date('2026-09-01T00:00:00Z')).reason, 'not-yet-valid');
});
test('rejects malformed and arbitrary codes', () => {
  for (const item of ['', 'WPP1.abc.xyz', 'wrong', '.'.repeat(100), 123, 'x'.repeat(5000)]) assert.equal(licenseStatus(item).ok, false);
});