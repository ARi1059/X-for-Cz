import test from 'node:test';
import assert from 'node:assert/strict';
import { issueToken, verifyToken, hashPassword, verifyPassword, validNewPassword, cookie } from '../src/server/auth.ts';
import type { Runtime } from '../src/server/runtime.ts';

const secret = 'a'.repeat(64);
test('age token is purpose bound, signature checked, fixed 30 days, and expires exactly', () => {
  const now = Date.now(); const grant = issueToken('age', secret, now);
  assert.equal(grant.payload.expiresAt - now, 2592000000);
  assert.deepEqual(verifyToken(grant.token, 'age', secret, now), grant.payload);
  assert.equal(verifyToken(grant.token, 'csrf', secret, now), null);
  assert.equal(verifyToken(grant.token, 'age', secret + 'x', now), null);
  assert.equal(verifyToken(grant.token, 'age', secret, now - 1), null);
  assert.equal(verifyToken(grant.token, 'age', secret, grant.payload.expiresAt), null);
  const parts = grant.token.split('.');
  const changedFirst = parts[1]![0] === 'x' ? 'y' : 'x';
  assert.equal(verifyToken(parts[0] + '.' + changedFirst + parts[1]!.slice(1), 'age', secret, now), null);
});
test('CSRF challenge has a short independent purpose and expiry', () => {
  const now = Date.now(); const grant = issueToken('csrf', secret, now);
  assert.equal(grant.payload.expiresAt - now, 1800000);
  assert.equal(verifyToken(grant.token, 'csrf', secret, now + 1800000), null);
});
test('scrypt uses separate salts, rejects wrong passwords and malformed encodings', async () => {
  const password = 'a careful secret passphrase';
  const one = await hashPassword(password); const two = await hashPassword(password);
  assert.notEqual(one, two); assert.match(one, /^scrypt\$32768\$8\$1\$/);
  assert(await verifyPassword(password, one)); assert.equal(await verifyPassword('incorrect', one), false);
  assert.equal(await verifyPassword(password, 'plain:' + password), false);
  assert.equal(validNewPassword('short'), false); assert.equal(validNewPassword('x'.repeat(257)), false);
  await assert.rejects(hashPassword('short'));
});
test('production cookies use host prefix, secure httponly strict path and fixed age', () => {
  const runtime = { secureCookies: true } as Runtime;
  assert.equal(cookie(runtime, 'age', 'TOKEN', 2592000), '__Host-age=TOKEN; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure');
  assert.equal(cookie(runtime, 'admin', '', 0), '__Host-admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure');
});
