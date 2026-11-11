'use strict';
const { verify } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const PUBLIC_KEY = readFileSync(join(__dirname, 'public-key.pem'), 'utf8');
const PREFIX = 'WPP1';
const PRODUCT = 'artisys-wppprospector';

function licenseStatus(code, now = new Date()) {
  try {
    if (typeof code !== 'string' || code.length > 4096) return { ok: false, reason: 'invalid' };
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