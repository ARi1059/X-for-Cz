import { randomUUID, createHmac } from 'node:crypto';
import { z } from 'zod';
import {
  ConfigValidationError, LINK_IDS, normalizeSource, parseSiteConfig, projectGate, projectPublished,
  referencedMediaIds, validateForPublish, type SiteConfig, type ValidationIssue,
} from '../contracts/site-config.ts';
import { immediateTransaction } from '../storage/database.ts';
import { incrementStatistic, publishDraft, PublishValidationError, readDraft, RevisionConflictError, saveDraft, type Draft } from '../storage/site-store.ts';
import { readPublicVersion } from './publication.ts';
import { getRuntime, type Runtime } from './runtime.ts';
import { cookie, createAdminSession, dummyPasswordCheck, equalSecret, hashPassword, issueToken, readAdmin, readAge, tokenHash, validNewPassword, verifyPassword, verifyToken } from './auth.ts';
import { importMedia, listMedia, readMedia, removeMedia, MediaError } from './media.ts';

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields?: ValidationIssue[], readonly retryAfter?: number) { super(message); }
}
const iso = (timestamp: number) => new Date(timestamp).toISOString();
const emptySchema = z.strictObject({});
const sourceSchema = z.strictObject({ source: z.string().max(64) });
const revisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const mediaIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const versionSchema = z.string().min(1).max(128);
// Password setup counts graphemes; combining sequences may contain more code points.
const credentialPasswordSchema = z.string().min(1).max(1024).refine(v => Buffer.byteLength(v) <= 1024);
const responseHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Vary': 'Cookie, Authorization' };
function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(value, { status, headers: { ...responseHeaders, ...headers } });
}
function noContent(headers: HeadersInit = {}) { return new Response(null, { status: 204, headers: { ...responseHeaders, ...headers } }); }
function errorResponse(error: unknown, requestId: string): Response {
  let issue: HttpError;
  if (error instanceof HttpError) issue = error;
  else if (error instanceof ConfigValidationError || error instanceof PublishValidationError) issue = new HttpError(422, error instanceof PublishValidationError ? error.code : 'VALIDATION_FAILED', error instanceof PublishValidationError ? '发布前请完善以下内容。' : error.message, error.issues);
  else if (error instanceof RevisionConflictError) issue = new HttpError(409, error.code, '草稿已在其他页面更新。请保留输入并重新读取草稿。');
  else if (error instanceof MediaError) issue = new HttpError(error.status, error.code, error.message);
  else issue = new HttpError(500, 'INTERNAL_ERROR', '服务暂时异常，请稍后重试。');
  return json({ error: { code: issue.code, message: issue.message, requestId, ...(issue.fields ? { fields: issue.fields } : {}) } }, issue.status, issue.retryAfter ? { 'Retry-After': String(issue.retryAfter) } : {});
}
function parse<T>(schema: z.ZodType<T>, value: unknown, status = 422): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(status, 'VALIDATION_FAILED', '请检查填写内容。', result.error.issues.map(v => ({ path: v.path.join('.'), code: v.code, message: v.message })));
  return result.data;
}
async function boundedBytes(request: Request, limit: number): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new HttpError(413, 'BODY_TOO_LARGE', '提交内容超过大小限制。');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); throw new HttpError(413, 'BODY_TOO_LARGE', '提交内容超过大小限制。'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new HttpError(400, 'JSON_REQUIRED', '请以 JSON 提交内容。');
  const bytes = await boundedBytes(request, 262144);
  let input: unknown;
  try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new HttpError(400, 'INVALID_JSON', '提交内容格式有误。'); }
  return parse(schema, input);
}
function sameOrigin(request: Request, runtime: Runtime): void {
  if (request.headers.get('origin') !== runtime.origin) throw new HttpError(403, 'ORIGIN_DENIED', '请从本站页面执行此操作。');
}
function publicCsrf(request: Request, runtime: Runtime): void {
  sameOrigin(request, runtime);
  if (!verifyToken(request.headers.get('x-csrf-token') ?? '', 'csrf', runtime.sessionSecret)) throw new HttpError(403, 'CSRF_INVALID', '页面验证已过期，请刷新页面。');
}
function requireAge(request: Request, runtime: Runtime, cookieOnly = false) {
  const age = readAge(request, runtime, cookieOnly);
  if (!age) throw new HttpError(401, 'AGE_REQUIRED', '请先确认你已年满 18 岁。');
  return age;
}
function requireAdmin(request: Request, runtime: Runtime, write = false) {
  const admin = readAdmin(request, runtime);
  if (!admin) throw new HttpError(401, 'ADMIN_REQUIRED', '请重新登录管理员账号。');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'ORIGIN_DENIED', '请从本站访问后台。');
  if (write) {
    sameOrigin(request, runtime);
    if (!equalSecret(request.headers.get('x-csrf-token') ?? '', admin.csrfToken)) throw new HttpError(403, 'CSRF_INVALID', '页面验证已过期，请刷新后台。');
  }
  return admin;
}
function draftWire(draft: Draft) { return { revision: draft.revision, updatedAt: iso(draft.updatedAt), config: draft.config }; }
function publication(runtime: Runtime, version: unknown) {
  parse(versionSchema, version, 400);
  const published = readPublicVersion(runtime);
  if (published.versionId !== version) throw new HttpError(409, 'VERSION_CHANGED', '页面已有新版本，请重新加载。');
  return published;
}
function publicLqip(runtime: Runtime, config: SiteConfig): Map<string, string | null> {
  const ids = [...new Set([config.site.avatarMediaId, ...config.gallery.photos.map(photo => photo.mediaId)].filter((id): id is string => Boolean(id)))];
  const result = new Map<string, string | null>();
  if (!ids.length) return result;
  const rows = runtime.db.prepare(`SELECT id, lqip FROM media_assets WHERE status='ready' AND id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  for (const row of rows) result.set(String(row.id), row.lqip ? String(row.lqip) : null);
  return result;
}
function variant(url: URL): 'thumbnail' | 'display' { return parse(z.enum(['thumbnail', 'display']), url.searchParams.get('variant') ?? 'display', 400); }
function stats(runtime: Runtime, event: 'gate_view' | 'adult_confirm' | 'leave' | 'link_click', source: unknown, linkId?: typeof LINK_IDS[number]) {
  incrementStatistic(runtime.db, { day: new Date().toISOString().slice(0, 10), event, source: normalizeSource(source), ...(linkId ? { linkId } : {}) });
}
function preview(runtime: Runtime) {
  const draft = readDraft(runtime.db);
  const ready = runtime.db.prepare("SELECT id, purpose FROM media_assets WHERE status = 'ready'").all();
  return { revision: draft.revision, config: draft.config, publishIssues: validateForPublish(draft.config, { siteOrigin: runtime.origin,
    readyMediaIds: new Set(ready.map(v => String(v.id))), publicShareMediaIds: new Set(ready.filter(v => v.purpose === 'public_share').map(v => String(v.id))) }) };
}
function queryKeys(url: URL, allowed: string[]): void {
  for (const key of url.searchParams.keys()) if (!allowed.includes(key) || url.searchParams.getAll(key).length > 1) throw new HttpError(400, 'INVALID_QUERY', '请求参数有误。');
}
function dateValue(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new HttpError(400, 'INVALID_DATE', '请选择有效的日期范围。');
  return value;
}

/** One handler instance owns bounded ephemeral counters; no raw IP or request log is retained. */
export function createHandler(runtime: Runtime): (request: Request) => Promise<Response> {
  const limits = new Map<string, { count: number; expiresAt: number }>();
  let lastCleanup = 0;
  function limit(key: string, maximum: number, seconds: number) {
    const now = Date.now();
    for (const [k,v] of limits) if (v.expiresAt <= now) limits.delete(k);
    if (!limits.has(key) && limits.size >= 5000) throw new HttpError(429, 'RATE_LIMITED', '操作频繁，请稍后重试。', undefined, 60);
    const bucket = limits.get(key) ?? { count: 0, expiresAt: now + seconds * 1000 };
    if (bucket.count >= maximum) throw new HttpError(429, 'RATE_LIMITED', '操作频繁，请稍后重试。', undefined, Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)));
    bucket.count++; limits.set(key, bucket);
  }
  function anonymousKey(request: Request): string {
    return createHmac('sha256', runtime.sessionSecret).update(new Date().toISOString().slice(0,10)).update(request.headers.get('user-agent')?.slice(0,512) ?? '').digest('hex');
  }
  async function mediaResponse(id: string, selected: 'thumbnail' | 'display'): Promise<Response> {
    parse(mediaIdSchema, id, 400);
    const media = await readMedia(runtime.db, runtime.mediaRoot, id, selected);
    return new Response(new Uint8Array(media.bytes), { status: 200, headers: { ...responseHeaders, 'Content-Type': media.mimeType, 'Content-Disposition': `inline; filename="${id}.webp"` } });
  }
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID();
    try {
      const url = new URL(request.url); const path = url.pathname; const method = request.method;
      if (Date.now() - lastCleanup > 60000) {
        runtime.db.prepare('DELETE FROM age_revocations WHERE expires_at <= ?').run(Date.now());
        runtime.db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(Date.now()); lastCleanup = Date.now();
      }
      if (method === 'GET' && path === '/api/gate') {
        const published = readPublicVersion(runtime); const age = readAge(request, runtime);
        const gate = projectGate(published.config);
        if (gate.meta.shareMediaId && !runtime.db.prepare("SELECT id FROM media_assets WHERE id = ? AND status = 'ready' AND purpose = 'public_share'").get(gate.meta.shareMediaId)) gate.meta.shareMediaId = null;
        return json({ versionId: published.versionId, ...gate, ageStatus: { confirmed: Boolean(age), expiresAt: age ? iso(age.payload.expiresAt) : null }, csrfToken: issueToken('csrf', runtime.sessionSecret).token });
      }
      if (method === 'POST' && ['/api/events/gate-view', '/api/age/confirm', '/api/age/reset', '/api/age/leave'].includes(path)) {
        publicCsrf(request, runtime);
        limit('public-site', 600, 60); limit('public:' + anonymousKey(request), 120, 60);
        if (path === '/api/age/reset') {
          const age = requireAge(request, runtime); await body(request, emptySchema);
          runtime.db.prepare('INSERT OR REPLACE INTO age_revocations(token_hash,expires_at) VALUES (?,?)').run(tokenHash(age.token), age.payload.expiresAt);
          return noContent({ 'Set-Cookie': cookie(runtime, 'age', '', 0) });
        }
        if (path === '/api/age/confirm') {
          const input = await body(request, z.strictObject({ adult: z.literal(true), storage: z.enum(['cookie','memory']), source: z.string().max(64) }));
          const previous = readAge(request, runtime); const grant = previous ?? issueToken('age', runtime.ageSecret);
          const expiresIn = Math.max(0, Math.floor((grant.payload.expiresAt - Date.now()) / 1000));
          if (!previous) stats(runtime, 'adult_confirm', input.source);
          return json({ storage: input.storage, confirmed: true, issuedAt: iso(grant.payload.issuedAt), expiresAt: iso(grant.payload.expiresAt), expiresIn,
            ...(input.storage === 'memory' ? { accessToken: grant.token } : {}) }, 200, input.storage === 'cookie' ? { 'Set-Cookie': cookie(runtime, 'age', grant.token, expiresIn) } : {});
        }
        const input = await body(request, sourceSchema);
        if (path === '/api/events/gate-view') { stats(runtime, 'gate_view', input.source); return noContent(); }
        const { ageGate } = readPublicVersion(runtime).config; stats(runtime, 'leave', input.source);
        return json({ exitUrl: ageGate.exitUrl, notice: ageGate.exitNotice });
      }
      if (method === 'GET' && path === '/api/site') { requireAge(request, runtime); const published = readPublicVersion(runtime); return json(projectPublished(published.config, published.versionId, publicLqip(runtime, published.config))); }
      const go = /^\/go\/([^/]+)$/.exec(path);
      const resolve = /^\/api\/links\/([^/]+)\/resolve$/.exec(path);
      if ((go && method === 'GET') || (resolve && method === 'POST')) {
        requireAge(request, runtime, Boolean(go));
        const id = parse(z.enum(LINK_IDS), (go ?? resolve)![1], 400);
        let version: string; let source: unknown;
        if (go) { queryKeys(url, ['version','from']); version = parse(versionSchema, url.searchParams.get('version'), 400); source = url.searchParams.get('from'); }
        else { publicCsrf(request, runtime); const input = await body(request, z.strictObject({ versionId: versionSchema, source: z.string().max(64) })); version = input.versionId; source = input.source; }
        const published = publication(runtime, version); const link = published.config.links.find(v => v.id === id);
        if (!link?.visible || !link.enabled || !link.url) throw new HttpError(404, 'LINK_UNAVAILABLE', '该入口暂未开放。');
        limit('click:' + tokenHash(requireAge(request, runtime, Boolean(go)).token), 60, 60);
        stats(runtime, 'link_click', source, id);
        if (go) return new Response(null, { status: 302, headers: { ...responseHeaders, Location: link.url } });
        return json({ versionId: published.versionId, url: link.url });
      }
      const publicMedia = /^\/(media|share)\/([^/]+)$/.exec(path);
      if (method === 'GET' && publicMedia) {
        queryKeys(url, publicMedia[1] === 'media' ? ['version','variant'] : ['version']);
        const id = parse(mediaIdSchema, publicMedia[2], 400);
        if (publicMedia[1] === 'media') requireAge(request, runtime);
        const published = publication(runtime, url.searchParams.get('version'));
        if (publicMedia[1] === 'share') {
          if (published.config.meta.shareMediaId !== id || !runtime.db.prepare("SELECT id FROM media_assets WHERE id = ? AND status = 'ready' AND purpose = 'public_share'").get(id)) throw new HttpError(404, 'MEDIA_NOT_FOUND', '图片不存在。');
        } else {
          const projection = projectPublished(published.config, published.versionId);
          if (projection.site.avatarMediaId !== id && !projection.gallery.photos.some(v => v.mediaId === id)) throw new HttpError(404, 'MEDIA_NOT_FOUND', '图片不存在。');
          if (!runtime.db.prepare("SELECT id FROM media_assets WHERE id = ? AND status = 'ready' AND purpose = 'controlled'").get(id)) throw new HttpError(404, 'MEDIA_NOT_FOUND', '图片不存在。');
        }
        return await mediaResponse(id, publicMedia[1] === 'share' ? 'display' : variant(url));
      }
      if (path === '/api/admin/login' && method === 'POST') {
        sameOrigin(request, runtime); limit('login-site', 60, 900); limit('login:' + anonymousKey(request), 8, 900);
        const input = await body(request, z.strictObject({ username: z.string().min(1).max(128), password: credentialPasswordSchema }));
        const admin = runtime.db.prepare('SELECT username,password_hash,auth_version FROM administrators WHERE id = 1').get();
        const valid = admin ? await verifyPassword(input.password, String(admin.password_hash)) : (await dummyPasswordCheck(input.password), false);
        if (!valid || !admin || !equalSecret(input.username, String(admin.username))) throw new HttpError(401, 'INVALID_CREDENTIALS', '账号或密码有误。');
        const session = immediateTransaction(runtime.db, () => {
          const current = runtime.db.prepare('SELECT password_hash,auth_version FROM administrators WHERE id = 1').get();
          if (!current || current.auth_version !== admin.auth_version || current.password_hash !== admin.password_hash) throw new HttpError(401, 'INVALID_CREDENTIALS', '账号或密码有误。');
          return createAdminSession(runtime);
        });
        return json({ username: session.username, expiresAt: iso(session.expiresAt), csrfToken: session.csrfToken }, 200, { 'Set-Cookie': cookie(runtime, 'admin', session.token, (session.expiresAt - Date.now()) / 1000) });
      }
      if (path.startsWith('/api/admin/')) {
        const admin = requireAdmin(request, runtime, !['GET','HEAD'].includes(method));
        if (path === '/api/admin/session' && method === 'GET') return json({ username: admin.username, expiresAt: iso(admin.expiresAt), csrfToken: admin.csrfToken });
        if (path === '/api/admin/logout' && method === 'POST') {
          await body(request, emptySchema);
          immediateTransaction(runtime.db, () => { runtime.db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(admin.tokenHash); runtime.db.prepare("INSERT INTO audit_log(action,actor_id,created_at) VALUES ('session_revoked',1,?)").run(Date.now()); });
          return noContent({ 'Set-Cookie': cookie(runtime, 'admin', '', 0) });
        }
        if (path === '/api/admin/password' && method === 'PUT') {
          limit('password:' + admin.tokenHash, 5, 900);
          const input = await body(request, z.strictObject({ currentPassword: credentialPasswordSchema, newPassword: z.string().max(1024).refine(validNewPassword) }));
          if (!await verifyPassword(input.currentPassword, admin.passwordHash)) throw new HttpError(401, 'INVALID_CREDENTIALS', '当前密码有误。');
          const password = await hashPassword(input.newPassword);
          immediateTransaction(runtime.db, () => {
            const current = readAdmin(request, runtime);
            if (!current || current.passwordHash !== admin.passwordHash) throw new HttpError(401, 'ADMIN_REQUIRED', '请重新登录管理员账号。');
            runtime.db.prepare('UPDATE administrators SET password_hash = ?, auth_version = auth_version + 1, updated_at = ? WHERE id = 1').run(password, Date.now());
            runtime.db.prepare('DELETE FROM admin_sessions').run(); runtime.db.prepare("INSERT INTO audit_log(action,actor_id,created_at) VALUES ('password_changed',1,?)").run(Date.now());
          });
          return noContent({ 'Set-Cookie': cookie(runtime, 'admin', '', 0) });
        }
        if (path === '/api/admin/draft' && method === 'GET') return json(draftWire(readDraft(runtime.db)));
        if (path === '/api/admin/draft' && method === 'PUT') {
          const input = await body(request, z.strictObject({ expectedRevision: revisionSchema, config: z.unknown() }));
          const config = parseSiteConfig(input.config);
          const missing = referencedMediaIds(config).filter(id => !runtime.db.prepare("SELECT id FROM media_assets WHERE id = ? AND status = 'ready'").get(id));
          if (missing.length) throw new HttpError(422, 'MEDIA_NOT_READY', '引用的图片尚未就绪。', missing.map(id => ({ path: 'media.'+id, code: 'MEDIA_NOT_READY', message: '请重新选择已处理的图片。' })));
          return json(draftWire(saveDraft(runtime.db, config, { expectedRevision: input.expectedRevision, actorId: 1 })));
        }
        if (path === '/api/admin/preview' && method === 'GET') return json(preview(runtime));
        if (path === '/api/admin/publish' && method === 'POST') {
          const input = await body(request, z.strictObject({ expectedRevision: revisionSchema }));
          const published = publishDraft(runtime.db, { expectedRevision: input.expectedRevision, actorId: 1, siteOrigin: runtime.origin });
          return json({ versionId: published.versionId, publishedAt: iso(published.createdAt), sourceRevision: published.sourceRevision }, 201);
        }
        if (path === '/api/admin/media' && method === 'GET') {
          queryKeys(url, ['cursor','limit']);
          const cursor = url.searchParams.get('cursor'); const rawLimit = url.searchParams.get('limit');
          if (cursor !== null) parse(mediaIdSchema, cursor, 400);
          if (rawLimit !== null && !/^\d+$/.test(rawLimit)) throw new HttpError(400, 'INVALID_LIMIT', '分页数量有误。');
          const pageLimit = parse(z.number().int().min(1).max(100), rawLimit === null ? 30 : Number(rawLimit), 400);
          return json(listMedia(runtime.db, { ...(cursor ? { cursor } : {}), limit: pageLimit }));
        }
        if (path === '/api/admin/media' && method === 'POST') {
          limit('upload:' + admin.tokenHash, 30, 60);
          if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new HttpError(400, 'MULTIPART_REQUIRED', '请选择图片上传。');
          const bytes = await boundedBytes(request, 10 * 1024 * 1024 + 65536);
          let form: FormData;
          try { form = await new Response(new Uint8Array(bytes).buffer, { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData(); }
          catch { throw new HttpError(400, 'INVALID_MULTIPART', '图片上传格式有误。'); }
          if ([...form.keys()].some(key => !['file','purpose','neutralConfirmed'].includes(key) || form.getAll(key).length !== 1)) throw new HttpError(400, 'INVALID_UPLOAD', '图片上传字段有误。');
          const file = form.get('file');
          if (!(file instanceof File)) throw new HttpError(400, 'FILE_REQUIRED', '请选择图片上传。');
          const purpose = parse(z.enum(['controlled','public_share']), form.get('purpose'));
          const neutral = parse(z.enum(['true','false']), form.get('neutralConfirmed')) === 'true';
          return json(await importMedia(runtime.db, runtime.mediaRoot, new Uint8Array(await file.arrayBuffer()), { purpose, neutralConfirmed: neutral, actorId: 1 }), 201);
        }
        const adminMedia = /^\/api\/admin\/media\/([^/]+)(\/content)?$/.exec(path);
        if (adminMedia) {
          const id = parse(mediaIdSchema, adminMedia[1], 400);
          if (method === 'GET' && adminMedia[2]) { queryKeys(url, ['variant']); return await mediaResponse(id, variant(url)); }
          if (method === 'DELETE' && !adminMedia[2]) { await removeMedia(runtime.db, runtime.mediaRoot, id, 1); return noContent(); }
        }
        if (path === '/api/admin/stats' && method === 'GET') {
          queryKeys(url, ['from','to']); const from = dateValue(url.searchParams.get('from')); const to = dateValue(url.searchParams.get('to'));
          if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 >= 90) throw new HttpError(400, 'INVALID_RANGE', '日期范围最多为 90 天。');
          const rows = runtime.db.prepare('SELECT * FROM daily_statistics WHERE day >= ? AND day <= ? ORDER BY day,source,event,link_id').all(from, to);
          return json({ from, to, buckets: rows.map(v => ({ date: String(v.day), source: String(v.source), event: String(v.event), linkId: v.link_id ? String(v.link_id) : null, count: Number(v.count) })) });
        }
      }
      throw new HttpError(404, 'NOT_FOUND', '请求的内容不存在。');
    } catch (error) { return errorResponse(error, requestId); }
  };
}
let defaultHandler: ReturnType<typeof createHandler> | undefined;
export async function handleRequest(request: Request): Promise<Response> {
  try { defaultHandler ??= createHandler(getRuntime()); return await defaultHandler(request); }
  catch (error) { return errorResponse(error, randomUUID()); }
}
