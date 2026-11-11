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

const { createHash } = require('node:crypto');
const shortFixtureCode = 'ABCDEFGHJKLMNPQ2';
const shortFixture = {
  id: 'qa-short-license',
  hash: createHash('sha256').update('artisys-wppprospector:short-v1:' + shortFixtureCode).digest('hex'),
  issuedAt: '2026-11-11T00:00:00Z',
  expiresAt: '2026-11-25T00:00:00Z',
};

test('accepts exactly 16-character offline trial and ignores case', () => {
  const now = new Date('2026-11-15T00:00:00Z');
  const status = licenseStatus(shortFixtureCode.toLowerCase(), now, shortFixture);
  assert.equal(status.ok, true);
  assert.equal(status.kind, 'trial');
  assert.equal(status.id, shortFixture.id);
  assert.equal(status.expiresAt, shortFixture.expiresAt);
});

test('rejects guessed, truncated, extended and changed short trial codes', () => {
  const now = new Date('2026-11-15T00:00:00Z');
  for (const bad of [
    shortFixtureCode.slice(0, -1), shortFixtureCode + 'A', 'AAAAAAAAAAAAAAAA',
    shortFixtureCode.slice(0,-1) + '3', 'OOOOOOOOOOOOOOOO', '1111111111111111'
  ]) assert.equal(licenseStatus(bad, now, shortFixture).ok, false, bad);
});

test('short trials expire at fixed UTC date, cannot be used before issuance', () => {
  assert.equal(licenseStatus(shortFixtureCode, new Date('2026-11-11T00:00:00Z'), shortFixture).ok, true);
  assert.equal(licenseStatus(shortFixtureCode, new Date('2026-11-25T00:00:00Z'), shortFixture).reason, 'expired');
  assert.equal(licenseStatus(shortFixtureCode, new Date('2026-11-10T23:54:00Z'), shortFixture).reason, 'not-yet-valid');
});
