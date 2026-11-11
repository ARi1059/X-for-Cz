import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createHandler } from '../src/server/http.ts';
import { hashPassword, tokenHash } from '../src/server/auth.ts';
import type { Runtime } from '../src/server/runtime.ts';
import { migrate, openDatabase } from '../src/storage/database.ts';
import { readDraft, readPublished, saveDraft, seedSite } from '../src/storage/site-store.ts';
import { importMedia } from '../src/server/media.ts';

const origin = 'https://nav.godfather.cn';
const password = 'test passphrase 4321';
async function fixture(t: { after(fn: () => Promise<void> | void): void }) {
  const directory = await mkdtemp(join(tmpdir(), 'godfather-http-'));
  const db = openDatabase(join(directory, 'site.sqlite')); migrate(db);
  seedSite(db, JSON.parse(await readFile(new URL('../config/initial-site.json', import.meta.url), 'utf8')));
  const now = Date.now();
  db.prepare('INSERT INTO administrators(id,username,password_hash,created_at,updated_at) VALUES (1,?,?,?,?)').run('tester', await hashPassword(password), now, now);
  const runtime: Runtime = { db, mediaRoot: join(directory, 'media'), origin, ageSecret: 'a'.repeat(64), sessionSecret: 'b'.repeat(64), secureCookies: true };
  const handler = createHandler(runtime);
  t.after(async () => { db.close(); await rm(directory, { recursive: true, force: true }); });
  function req(path: string, options: { method?: string; json?: unknown; cookie?: string; csrf?: string; bearer?: string; origin?: string; headers?: Record<string,string> } = {}) {
    return handler(new Request(origin + path, { method: options.method ?? 'GET', headers: {
      ...(options.json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.method && options.method !== 'GET' ? { Origin: options.origin ?? origin } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}), ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {}),
      ...(options.bearer ? { Authorization: 'Bearer ' + options.bearer } : {}), ...options.headers,
    }, ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }) }));
  }
  async function gate() { return (await req('/api/gate')).json(); }
  async function login() {
    const response = await req('/api/admin/login', { method: 'POST', json: { username: 'tester', password } });
    assert.equal(response.status, 200); const value = await response.json();
    return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, csrf: value.csrfToken as string, session: value };
  }
  async function confirm(storage: 'cookie' | 'memory' = 'memory') {
    const g = await gate(); const response = await req('/api/age/confirm', { method: 'POST', csrf: g.csrfToken, json: { adult: true, storage, source: 'profile' } });
    assert.equal(response.status, 200); return { grant: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], csrf: g.csrfToken as string };
  }
  return { directory, db, runtime, handler, req, gate, login, confirm };
}

test('HTTP age gate reveals neutral data only, strict Origin/CSRF, fixed expiry, memory revocation', async t => {
  const f = await fixture(t); const gateResponse = await f.req('/api/gate'); const gate = await gateResponse.json();
  assert.equal(gateResponse.headers.get('cache-control'), 'private, no-store');
  assert.equal(gate.name, '教父'); assert.equal(gate.ageStatus.confirmed, false);
  const raw = JSON.stringify(gate); assert(!raw.includes('tagline')); assert(!raw.includes('x_profile')); assert(!raw.includes('avatarMediaId'));
  assert.equal((await f.req('/api/site')).status, 401);
  assert.equal((await f.req('/api/admin/draft')).status, 401);
  assert.equal((await f.req('/api/age/confirm', { method: 'POST', origin: 'https://cross.example', csrf: gate.csrfToken, json: { adult:true,storage:'memory',source:'profile' } })).status, 403);
  assert.equal((await f.req('/api/age/confirm', { method:'POST', json:{adult:true,storage:'memory',source:'profile'} })).status, 403);
  assert.equal((await f.req('/api/age/confirm', { method:'POST',csrf:gate.csrfToken,json:{adult:false,storage:'memory',source:'profile'} })).status, 422);
  const one = await f.confirm(); const bearer = one.grant.accessToken;
  assert.equal(Date.parse(one.grant.expiresAt) - Date.parse(one.grant.issuedAt), 2592000000);
  const site = await f.req('/api/site', { bearer }); assert.equal(site.status, 200); assert.equal(site.headers.get('cache-control'), 'private, no-store');
  const publicSite = await site.json(); assert.equal(publicSite.links.length, 5); assert(publicSite.links.every((v:{available:boolean;url?:string}) => !v.available && !v.url));
  const twice = await f.req('/api/age/confirm', { method:'POST',bearer,csrf:one.csrf,json:{adult:true,storage:'memory',source:'profile'} });
  const repeated = await twice.json(); assert.equal(repeated.issuedAt, one.grant.issuedAt); assert.equal(repeated.expiresAt, one.grant.expiresAt); assert.equal(repeated.accessToken, bearer);
  assert.equal((await f.req('/api/admin/draft', { bearer })).status, 401);
  assert.equal((await f.req('/api/age/reset', { method:'POST',bearer,csrf:one.csrf,json:{} })).status, 204);
  assert.equal((await f.req('/api/site', { bearer })).status, 401);
  assert.equal(f.db.prepare('SELECT token_hash FROM age_revocations WHERE token_hash = ?').get(tokenHash(bearer))?.token_hash, tokenHash(bearer));
  assert.equal((await f.req('/api/events/gate-view', {method:'POST',csrf:gate.csrfToken,json:{source:'profile',event:'link_click'}})).status,422);
  const leave = await f.req('/api/age/leave', {method:'POST',csrf:gate.csrfToken,json:{source:'profile'}}); assert.deepEqual(await leave.json(), {exitUrl:null,notice:gate.ageGate.exitNotice});
});

test('HTTP admin sessions isolate drafts, compare revisions, publish atomically and revoke on password change', async t => {
  const f = await fixture(t); const admin = await f.login();
  assert(admin.cookie.startsWith('__Host-admin='));
  const read = await f.req('/api/admin/draft', admin); const draft = await read.json();
  assert.equal((await f.req('/api/admin/publish', { ...admin,method:'POST',json:{expectedRevision:draft.revision} })).status,422);
  assert.equal(readPublished(f.db).versionId,'1');
  const preview = await f.req('/api/admin/preview', admin); assert((await preview.json()).publishIssues.length >= 3);
  const config = draft.config; config.ageGate.exitUrl = 'https://www.wikipedia.org/'; config.footer.contactEmail = 'contact@godfather.cn'; config.links[0].url='https://x.com/godfather'; config.links[0].enabled=true;
  assert.equal((await f.req('/api/admin/draft', {cookie:admin.cookie,method:'PUT',json:{expectedRevision:draft.revision,config}})).status,403);
  const saved = await f.req('/api/admin/draft', {...admin,method:'PUT',json:{expectedRevision:draft.revision,config}}); const next = await saved.json(); assert.equal(next.revision,2);
  assert.equal((await f.req('/api/admin/draft', {...admin,method:'PUT',json:{expectedRevision:draft.revision,config}})).status,409);
  assert.equal(readPublished(f.db).versionId,'1');
  const published = await f.req('/api/admin/publish', {...admin,method:'POST',json:{expectedRevision:next.revision}}); assert.equal(published.status,201); const version = (await published.json()).versionId;
  const age = await f.confirm('cookie');
  const publicSite = await (await f.req('/api/site',{cookie:age.cookie!})).json(); assert.equal(publicSite.versionId,version); assert.equal(publicSite.links[0].available,true); assert(!JSON.stringify(publicSite).includes('https://x.com'));
  assert.equal((await f.req('/go/x_profile?version=1',{cookie:age.cookie!})).status,409);
  const go = await f.req(`/go/x_profile?version=${version}&from=pin`,{cookie:age.cookie!}); assert.equal(go.status,302); assert.equal(go.headers.get('location'),'https://x.com/godfather');
  const memory = await f.confirm();
  assert.equal((await f.req(`/go/x_profile?version=${version}`,{bearer:memory.grant.accessToken})).status,401);
  const resolved = await f.req('/api/links/x_profile/resolve',{method:'POST',bearer:memory.grant.accessToken,csrf:memory.csrf,json:{versionId:version,source:'weekly'}}); assert.equal(resolved.status,200); assert.equal((await resolved.json()).url,'https://x.com/godfather');
  const today = new Date().toISOString().slice(0,10); const stats = await f.req(`/api/admin/stats?from=${today}&to=${today}`,admin); const report = await stats.json(); assert(report.buckets.some((v:{event:string;linkId:string;count:number}) => v.event==='link_click' && v.linkId==='x_profile' && v.count===1));
  assert.equal((await f.req('/api/admin/stats?from=2026-01-01&to=2026-05-01',admin)).status,400);
  const sessionBefore = await (await f.req('/api/admin/session',admin)).json(); assert.equal(sessionBefore.expiresAt,admin.session.expiresAt);
  assert.equal((await f.req('/api/admin/password',{...admin,method:'PUT',json:{currentPassword:password,newPassword:'changed passphrase 5678'}})).status,204);
  assert.equal((await f.req('/api/admin/session',admin)).status,401);
  assert.equal((await f.req('/api/site',{cookie:age.cookie!})).status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get()!.n,0);
});

test('HTTP media upload requires admin and purpose, hidden and draft images stay private, published images retain references', async t => {
  const f = await fixture(t); const admin = await f.login(); const age = await f.confirm();
  const image = await sharp({create:{width:16,height:20,channels:3,background:'#c7a678'}}).png().toBuffer();
  function upload(purpose='controlled',neutral='false') {
    const form = new FormData(); form.set('file',new File([image],'test.png',{type:'image/png'}));form.set('purpose',purpose);form.set('neutralConfirmed',neutral);
    return f.handler(new Request(origin+'/api/admin/media',{method:'POST',headers:{Origin:origin,Cookie:admin.cookie,'X-CSRF-Token':admin.csrf},body:form}));
  }
  assert.equal((await upload('public_share','false')).status,422);
  const uploaded = await upload(); assert.equal(uploaded.status,201); const media = await uploaded.json(); assert.equal(media.status,'ready');
  const list = await (await f.req('/api/admin/media',admin)).json(); assert.equal(list.items.length,1); assert(!JSON.stringify(list).includes('storage_key'));
  assert.equal((await f.req(`/api/admin/media/${media.id}/content`,{bearer:age.grant.accessToken})).status,401);
  const content = await f.req(`/api/admin/media/${media.id}/content`,admin); assert.equal(content.status,200); assert.equal(content.headers.get('content-type'),'image/webp');
  const decoded = await sharp(Buffer.from(await content.arrayBuffer())).metadata(); assert.equal(decoded.exif,undefined);
  assert.equal((await f.req(`/media/${media.id}?version=1`,{bearer:age.grant.accessToken})).status,404);
  assert.equal((await f.req(`/share/${media.id}?version=1`)).status,404);
  const d = await (await f.req('/api/admin/draft',admin)).json(); d.config.site.avatarMediaId=media.id;d.config.ageGate.exitUrl='https://www.wikipedia.org/';d.config.footer.contactEmail='contact@godfather.cn';d.config.links[0].url='https://x.com/godfather';d.config.links[0].enabled=true;
  const saved = await (await f.req('/api/admin/draft',{...admin,method:'PUT',json:{expectedRevision:d.revision,config:d.config}})).json();
  assert.equal((await f.req(`/api/admin/media/${media.id}`,{...admin,method:'DELETE'})).status,409);
  const published = await (await f.req('/api/admin/publish',{...admin,method:'POST',json:{expectedRevision:saved.revision}})).json();
  const publicImage = await f.req(`/media/${media.id}?version=${published.versionId}&variant=thumbnail`,{bearer:age.grant.accessToken}); assert.equal(publicImage.status,200);assert.equal(publicImage.headers.get('cache-control'),'private, no-store');
  assert.equal((await f.req(`/media/${media.id}?version=${published.versionId}`)).status,401);
  const extra = await upload();const disposable = await extra.json();assert.equal((await f.req(`/api/admin/media/${disposable.id}`,{...admin,method:'DELETE'})).status,204);
  assert.equal((await f.req(`/api/admin/media/${disposable.id}/content`,admin)).status,404);
});

test('HTTP login throttles, malformed credentials share one response, logout clears current session', async t => {
  const f = await fixture(t); const admin = await f.login();
  for(let i=0;i<7;i++) assert.equal((await f.req('/api/admin/login',{method:'POST',json:{username:i%2?'tester':'missing',password:'bad'}})).status,401);
  const limited = await f.req('/api/admin/login',{method:'POST',json:{username:'tester',password}});assert.equal(limited.status,429);assert(Number(limited.headers.get('retry-after'))>0);
  assert.equal((await f.req('/api/admin/logout',{...admin,method:'POST',json:{}})).status,204);
  assert.equal((await f.req('/api/admin/session',admin)).status,401);
});

test('passwords with combining graphemes remain usable after a password change', async t => {
  const f = await fixture(t); const admin = await f.login();
  const unicodePassword = 'a\u0301'.repeat(200); // 200 graphemes, 400 code points, 600 UTF-8 bytes.
  assert.equal((await f.req('/api/admin/password', {
    ...admin, method: 'PUT', json: { currentPassword: password, newPassword: unicodePassword },
  })).status, 204);
  const login = await f.req('/api/admin/login', { method: 'POST', json: { username: 'tester', password: unicodePassword } });
  assert.equal(login.status, 200);
  const session = await login.json();
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  assert.equal((await f.req('/api/admin/password', {
    method: 'PUT', cookie, csrf: session.csrfToken,
    json: { currentPassword: unicodePassword, newPassword: 'another fixture passphrase 4567' },
  })).status, 204);
  assert.equal((await f.req('/api/admin/login', {
    method: 'POST', json: { username: 'tester', password: 'another fixture passphrase 4567' },
  })).status, 200);
  assert.equal((await f.req('/api/admin/login', {
    method: 'POST', json: { username: 'tester', password: 'é'.repeat(513) },
  })).status, 422);
});

test('explicit local draft view keeps age and version checks while serving draft photos without publishing', async t => {
  const environment: Record<string, string | undefined> = process.env;
  const previousEnvironment = environment.NODE_ENV;
  environment.NODE_ENV = 'development';
  t.after(() => { if (previousEnvironment === undefined) delete environment.NODE_ENV; else environment.NODE_ENV = previousEnvironment; });
  const f = await fixture(t);
  f.runtime.origin = 'http://localhost:3000';
  f.runtime.secureCookies = false;
  f.runtime.localDraftPreview = true;
  const bytes = await sharp({ create: { width: 16, height: 20, channels: 3, background: '#c7a678' } }).png().toBuffer();
  const media = await importMedia(f.db, f.runtime.mediaRoot, bytes, { purpose: 'controlled', neutralConfirmed: false });
  const draft = readDraft(f.db);
  draft.config.gallery.enabled = true;
  draft.config.gallery.photos.push({ id: 'local-photo', mediaId: media.id, alt: '本地照片', caption: null, position: 1, visible: true, focalPoint: { x: 0.5, y: 0.5 } });
  const saved = saveDraft(f.db, draft.config, { expectedRevision: draft.revision });
  function req(path: string, data?: unknown, token?: string, csrf?: string) {
    return f.handler(new Request(f.runtime.origin + path, { method: data === undefined ? 'GET' : 'POST', headers: {
      Origin: f.runtime.origin, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }));
  }
  const gate = await (await req('/api/gate')).json();
  assert.equal(gate.versionId, `local-draft-${saved.revision}`);
  assert.equal(gate.gallery, undefined); assert.equal(gate.links, undefined);
  assert(!JSON.stringify(gate).includes(media.id));
  assert.equal((await req('/api/site')).status, 401);
  assert.equal((await req(`/media/${media.id}?version=${gate.versionId}`)).status, 401);
  const grant = await (await req('/api/age/confirm', { adult: true, storage: 'memory', source: 'profile' }, undefined, gate.csrfToken)).json();
  const response = await req('/api/site', undefined, grant.accessToken);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const site = await response.json(); assert.equal(site.versionId, gate.versionId); assert.equal(site.gallery.photos.length, 1);
  assert.equal((await req(`/media/${media.id}?version=${site.versionId}&variant=thumbnail`, undefined, grant.accessToken)).status, 200);
  assert.equal((await req(`/media/${media.id}?version=1`, undefined, grant.accessToken)).status, 409);
  const updated = readDraft(f.db); updated.config.gallery.title = '新照片标题';
  saveDraft(f.db, updated.config, { expectedRevision: updated.revision });
  assert.equal((await req(`/media/${media.id}?version=${site.versionId}`, undefined, grant.accessToken)).status, 409);
  assert.equal(readPublished(f.db).versionId, '1'); assert.equal(readPublished(f.db).config.gallery.photos.length, 0);
  f.runtime.localDraftPreview = false;
  const published = await (await req('/api/site', undefined, grant.accessToken)).json();
  assert.equal(published.versionId, '1'); assert.equal(published.gallery.photos.length, 0);
  assert.equal((await req(`/media/${media.id}?version=1`, undefined, grant.accessToken)).status, 404);
});
