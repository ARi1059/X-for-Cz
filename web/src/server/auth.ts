import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { AGE_TTL_SECONDS, ADMIN_SESSION_TTL_SECONDS, graphemeLength } from '../contracts/site-config.ts';
import type { Runtime } from './runtime.ts';

export const CSRF_TTL_SECONDS = 1800;
export const tokenHash = (value: string): string => createHash('sha256').update(value).digest('hex');
export const randomToken = (): string => randomBytes(32).toString('base64url');
export function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
const hmac = (secret: string, input: string) => createHmac('sha256', secret).update(input).digest('base64url');
export interface SignedPayload { purpose: 'age' | 'csrf'; id: string; issuedAt: number; expiresAt: number }
export function signToken(payload: SignedPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(secret, body)}`;
}
export function verifyToken(token: string, purpose: SignedPayload['purpose'], secret: string, now = Date.now()): SignedPayload | null {
  if (token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !equalSecret(parts[1], hmac(secret, parts[0]))) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as SignedPayload;
    const ttl = purpose === 'age' ? AGE_TTL_SECONDS : CSRF_TTL_SECONDS;
    if (value.purpose !== purpose || !/^[A-Za-z0-9_-]{43}$/.test(value.id)
      || !Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt)
      || value.issuedAt > now || value.expiresAt <= now || value.expiresAt - value.issuedAt !== ttl * 1000) return null;
    return value;
  } catch { return null; }
}
export function issueToken(purpose: SignedPayload['purpose'], secret: string, now = Date.now()) {
  const payload: SignedPayload = { purpose, id: randomToken(), issuedAt: now, expiresAt: now + (purpose === 'age' ? AGE_TTL_SECONDS : CSRF_TTL_SECONDS) * 1000 };
  return { token: signToken(payload, secret), payload };
}
export function cookieName(runtime: Runtime, kind: 'age' | 'admin'): string { return runtime.secureCookies ? `__Host-${kind}` : `${kind}_dev`; }
export function getCookie(request: Request, name: string): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(name + '='));
  if (values.length !== 1) return null;
  return values[0]!.slice(name.length + 1);
}
export function cookie(runtime: Runtime, kind: 'age' | 'admin', value: string, maxAge: number): string {
  return `${cookieName(runtime, kind)}=${value}; Path=/; HttpOnly; SameSite=${kind === 'admin' ? 'Strict' : 'Lax'}; Max-Age=${Math.max(0, Math.floor(maxAge))}${runtime.secureCookies ? '; Secure' : ''}`;
}
export function readAge(request: Request, runtime: Runtime, cookieOnly = false) {
  const header = request.headers.get('authorization');
  const token = !cookieOnly && header ? (/^Bearer [A-Za-z0-9_.-]+$/.test(header) ? header.slice(7) : null) : getCookie(request, cookieName(runtime, 'age'));
  if (!token) return null;
  const payload = verifyToken(token, 'age', runtime.ageSecret);
  if (!payload || runtime.db.prepare('SELECT token_hash FROM age_revocations WHERE token_hash = ? AND expires_at > ?').get(tokenHash(token), Date.now())) return null;
  return { token, payload };
}
export function adminCsrf(runtime: Runtime, token: string): string { return hmac(runtime.sessionSecret, `admin-csrf:${token}`); }
export function readAdmin(request: Request, runtime: Runtime) {
  const token = getCookie(request, cookieName(runtime, 'admin'));
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = runtime.db.prepare(`SELECT s.token_hash, s.csrf_hash, s.expires_at, a.username, a.password_hash FROM admin_sessions s
    JOIN administrators a ON a.id = s.administrator_id AND a.auth_version = s.auth_version
    WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash(token), Date.now());
  if (!row) return null;
  const csrfToken = adminCsrf(runtime, token);
  if (!equalSecret(tokenHash(csrfToken), String(row.csrf_hash))) return null;
  return { token, tokenHash: String(row.token_hash), username: String(row.username), passwordHash: String(row.password_hash), csrfToken, expiresAt: Number(row.expires_at) };
}
export function createAdminSession(runtime: Runtime) {
  const admin = runtime.db.prepare('SELECT username, auth_version FROM administrators WHERE id = 1').get();
  if (!admin) throw new Error('Administrator is not initialized');
  const token = randomToken(); const csrfToken = adminCsrf(runtime, token); const now = Date.now();
  const expiresAt = now + ADMIN_SESSION_TTL_SECONDS * 1000;
  runtime.db.prepare('INSERT INTO admin_sessions(token_hash, administrator_id, csrf_hash, auth_version, created_at, expires_at) VALUES (?,1,?,?,?,?)')
    .run(tokenHash(token), tokenHash(csrfToken), Number(admin.auth_version), now, expiresAt);
  runtime.db.prepare("INSERT INTO audit_log(action,actor_id,created_at) VALUES ('session_created',1,?)").run(now);
  return { token, csrfToken, username: String(admin.username), expiresAt };
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result)));
}
export function validNewPassword(password: string): boolean { return graphemeLength(password) >= 12 && graphemeLength(password) <= 256 && Buffer.byteLength(password) <= 1024; }
export async function hashPassword(password: string): Promise<string> {
  if (!validNewPassword(password)) throw new Error('Password must contain 12–256 graphemes and at most 1024 UTF-8 bytes');
  const salt = randomBytes(16); const result = await derive(password, salt);
  return `scrypt$32768$8$1$${salt.toString('base64url')}$${result.toString('base64url')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (Buffer.byteLength(password) > 1024) return false;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts.slice(0,4).join('$') !== 'scrypt$32768$8$1' || !/^[A-Za-z0-9_-]{22}$/.test(parts[4] ?? '') || !/^[A-Za-z0-9_-]{86}$/.test(parts[5] ?? '')) return false;
  const result = await derive(password, Buffer.from(parts[4]!, 'base64url'));
  return equalSecret(result.toString('base64url'), parts[5]!);
}
/** Still execute scrypt for a missing account to avoid a username timing oracle. */
export async function dummyPasswordCheck(password: string): Promise<void> { await derive(password.slice(0, 256), Buffer.alloc(16)); }
