import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ConfigValidationError, graphemeLength, isExternalHttps, normalizeSource, parseSiteConfig, projectGate, projectPublished, validateForPublish } from '../src/contracts/site-config.ts';

const initial = () => parseSiteConfig(JSON.parse(readFileSync(new URL('../config/initial-site.json', import.meta.url), 'utf8')));

test('configuration has exact independent entries and preserves unresolved values', () => {
  const config = initial();
  assert.equal(config.site.name, '顾清棠');
  assert.equal(config.site.tagline, '短发御姐，丝袜和高跟鞋');
  assert(config.links.every(link => !link.enabled && link.url === null));
  const duplicate = structuredClone(config);
  duplicate.links[1]!.id = duplicate.links[0]!.id;
  assert.throws(() => parseSiteConfig(duplicate), ConfigValidationError);
  assert.throws(() => parseSiteConfig({ ...config, adminPassword: 'unexpected' }), ConfigValidationError);
  config.links[0]!.enabled = true;
  assert.throws(() => parseSiteConfig(config), ConfigValidationError);
});

test('Unicode length uses graphemes, and placeholder text is rejected', () => {
  const config = initial();
  const family = '👨‍👩‍👧‍👦';
  assert.equal(graphemeLength(family), 1);
  config.site.name = family.repeat(24);
  assert.equal(parseSiteConfig(config).site.name, config.site.name);
  config.site.name = family.repeat(25);
  assert.throws(() => parseSiteConfig(config), ConfigValidationError);
  config.site.name = '{{SITE_NAME}}';
  assert.throws(() => parseSiteConfig(config), ConfigValidationError);
});

test('targets reject scripts, credentials, local hosts, templates and same-site navigation', () => {
  for (const url of ['javascript:alert(1)', 'https://127.0.0.1/', 'https://[::1]/', 'https://localhost/', 'https://x.com@localhost/', 'https://user:pass@x.com/', 'https://example.com/', '{{X_PROFILE_URL}}', 'https://x.com/ x']) {
    assert.equal(isExternalHttps(url), false, url);
  }
  assert.equal(isExternalHttps('https://navigation.my-site.net/admin', 'https://navigation.my-site.net'), false);
  assert.equal(isExternalHttps('https://x.com/creator'), true);
});

test('before confirmation the projection contains neither biography, entry list nor controlled media', () => {
  const config = initial();
  config.site.avatarMediaId = 'private-avatar';
  config.links[0]!.url = 'https://x.com/creator';
  const gate = JSON.stringify(projectGate(config));
  for (const secret of ['private-avatar', 'https://x.com/creator', config.site.tagline!]) assert(!gate.includes(secret));
  const published = projectPublished(config, '1');
  assert(!JSON.stringify(published).includes('https://x.com/creator'));
  assert.equal(published.links[0]!.available, false);
  config.links[0]!.visible = false;
  assert.equal(projectPublished(config, '1').links.length, 4);
});

test('normal publication requires exit target, contact and active entry, then ready media', () => {
  const config = initial();
  assert.equal(validateForPublish(config).length, 3);
  config.ageGate.exitUrl = 'https://www.wikipedia.org/';
  config.footer.contactEmail = 'fixture@project.test';
  config.links[0]!.url = 'https://x.com/creator';
  config.links[0]!.enabled = true;
  assert.deepEqual(validateForPublish(config), []);
  config.site.avatarMediaId = 'asset-1';
  assert(validateForPublish(config).some(issue => issue.code === 'MEDIA_NOT_READY'));
  assert.deepEqual(validateForPublish(config, { readyMediaIds: new Set(['asset-1']) }), []);
  config.ageGate.confirmLabel = '继续';
  assert(validateForPublish(config, { readyMediaIds: new Set(['asset-1']) }).some(issue => issue.code === 'AGE_SEMANTICS'));
  for (const label of ['我未满18岁', '18天试用', '我还没有年满18岁']) {
    config.ageGate.confirmLabel = label;
    assert(validateForPublish(config, { readyMediaIds: new Set(['asset-1']) }).some(issue => issue.code === 'AGE_SEMANTICS'), label);
  }
});

test('source attribution never expands to arbitrary caller data', () => {
  assert.equal(normalizeSource('weekly'), 'weekly');
  assert.equal(normalizeSource('private-campaign-token'), 'other');
  assert.equal(normalizeSource(undefined), 'other');
});

test('optional blank values normalize to null without accepting missing required text', () => {
  const config = initial();
  config.site.tagline = '  ';
  config.footer.contactEmail = '';
  config.links[0]!.url = '';
  const parsed = parseSiteConfig(config);
  assert.equal(parsed.site.tagline, null);
  assert.equal(parsed.footer.contactEmail, null);
  assert.equal(parsed.links[0]!.url, null);
  config.site.name = '  ';
  assert.throws(() => parseSiteConfig(config), ConfigValidationError);
});

test('neutral public share assets and controlled portraits have separate purposes', () => {
  const config = initial();
  config.ageGate.exitUrl = 'https://www.wikipedia.org/';
  config.footer.contactEmail = 'fixture@project.test';
  config.links[0]!.url = 'https://x.com/creator';
  config.links[0]!.enabled = true;
  config.meta.shareMediaId = 'neutral-card';
  const readyMediaIds = new Set(['neutral-card']);
  assert(validateForPublish(config, { readyMediaIds }).some(issue => issue.code === 'SHARE_MEDIA_NOT_NEUTRAL'));
  assert.deepEqual(validateForPublish(config, { readyMediaIds, publicShareMediaIds: readyMediaIds }), []);
  config.site.avatarMediaId = 'neutral-card';
  assert(validateForPublish(config, { readyMediaIds, publicShareMediaIds: readyMediaIds }).some(issue => issue.code === 'MEDIA_PURPOSE_CONFLICT'));
});
