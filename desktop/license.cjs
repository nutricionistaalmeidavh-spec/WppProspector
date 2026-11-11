'use strict';
const { verify, createHash, timingSafeEqual } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const PUBLIC_KEY = readFileSync(join(__dirname, 'public-key.pem'), 'utf8');
const PREFIX = 'WPP1';
const PRODUCT = 'artisys-wppprospector';

// Compromisso SHA-256 de um código aleatório de 16 caracteres (80 bits).
// O código em claro é entregue fora do repositório e nunca é publicado no instalador.
const SHORT_TRIAL = Object.freeze({
  id: 'trial-20261111-v012',
  hash: 'cba4530ae5649fc57edbb7907f948e4506aebc495934f9c8229ccf3bd4286d3c',
  issuedAt: '2026-11-11T22:33:02Z',
  expiresAt: '2026-11-25T22:33:02Z',
});
const SHORT_DOMAIN = 'artisys-wppprospector:short-v1:';
const SHORT_PATTERN = /^[A-HJ-NP-Z2-9]{16}$/;

function shortLicenseStatus(normalized, now, trial) {
  if (!trial || !/^[a-f0-9]{64}$/.test(trial.hash ?? '')) return { ok: false, reason: 'invalid-payload' };
  const expected = Buffer.from(trial.hash, 'hex');
  const received = createHash('sha256').update(SHORT_DOMAIN + normalized, 'utf8').digest();
  if (!timingSafeEqual(expected, received)) return { ok: false, reason: 'invalid-signature' };

  const issued = Date.parse(trial.issuedAt);
  const expires = Date.parse(trial.expiresAt);
  const time = now.getTime();
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || !Number.isFinite(time)
    || expires <= issued || expires - issued > 14 * 86400_000) return { ok: false, reason: 'invalid-payload' };
  if (time < issued - 5 * 60_000) return { ok: false, reason: 'not-yet-valid' };
  if (time >= expires) return { ok: false, reason: 'expired', expiresAt: trial.expiresAt };
  return { ok: true, id: trial.id, kind: 'trial', expiresAt: trial.expiresAt };
}

function licenseStatus(code, now = new Date(), shortTrial = SHORT_TRIAL) {
  try {
    if (typeof code !== 'string' || code.length > 4096) return { ok: false, reason: 'invalid' };
    const normalized = code.trim().toUpperCase();
    if (SHORT_PATTERN.test(normalized)) return shortLicenseStatus(normalized, now, shortTrial);
    const parts = code.trim().split('.');
    if (parts.length !== 3 || parts[0] !== PREFIX || !/^[a-zA-Z0-9_-]+$/.test(parts[1]) || !/^[a-zA-Z0-9_-]+$/.test(parts[2])) return { ok: false, reason: 'invalid' };
    if (!verify(null, Buffer.from(parts[1], 'utf8'), PUBLIC_KEY, Buffer.from(parts[2], 'base64url'))) return { ok: false, reason: 'invalid-signature' };
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload || payload.v !== 1 || payload.product !== PRODUCT || typeof payload.id !== 'string' || !/^[\w-]{8,64}$/.test(payload.id) || !['trial', 'commercial'].includes(payload.kind)) return { ok: false, reason: 'invalid-payload' };
    const issued = Date.parse(payload.issuedAt);
    const expires = Date.parse(payload.expiresAt);
    const time = now.getTime();
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > 366 * 86400_000 || !Number.isFinite(time)) return { ok: false, reason: 'invalid-payload' };
    if (time < issued - 5 * 60_000) return { ok: false, reason: 'not-yet-valid' };
    if (time >= expires) return { ok: false, reason: 'expired', expiresAt: payload.expiresAt };
    return { ok: true, id: payload.id, kind: payload.kind, expiresAt: payload.expiresAt };
  } catch { return { ok: false, reason: 'invalid' }; }
}
module.exports = { licenseStatus };