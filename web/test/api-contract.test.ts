import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import SwaggerParser from '@apidevtools/swagger-parser';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import { parseSiteConfig, projectGate, projectPublished } from '../src/contracts/site-config.ts';

const addFormats = createRequire(import.meta.url)('ajv-formats') as FormatsPlugin;

test('actual gate and published projections conform to the API response schemas', async () => {
  const spec = await SwaggerParser.dereference(fileURLToPath(new URL('../contracts/openapi.json', import.meta.url)));
  const schemas = (spec as unknown as { components: { schemas: Record<string, object> } }).components.schemas;
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const validateGate = ajv.compile(schemas.Gate!);
  const validatePublic = ajv.compile(schemas.PublicSite!);
  const config = parseSiteConfig(JSON.parse(readFileSync(new URL('../config/initial-site.json', import.meta.url), 'utf8')));
  config.site.avatarMediaId = 'portrait-1';
  config.gallery.enabled = true;
  config.gallery.photos.push({ id: 'photo-1', mediaId: 'photo-asset', alt: '绿色裙装', caption: null, position: 1, visible: true, focalPoint: { x: 0.5, y: 0.5 } });
  const gate = { ...projectGate(config), versionId: '1', ageStatus: { confirmed: false, expiresAt: null }, csrfToken: 'fixture-challenge' };
  assert(validateGate(gate), JSON.stringify(validateGate.errors));
  assert(validatePublic(projectPublished(config, '1')), JSON.stringify(validatePublic.errors));
  assert(!validateGate({ ...gate, links: config.links }));
  const publicData = projectPublished(config, '1');
  assert(!validatePublic({ ...publicData, links: publicData.links.map(link => ({ ...link, url: 'https://x.com/fixture' })) }));
  const lqip = new Map([['portrait-1', 'data:image/webp;base64,AA'], ['photo-asset', 'data:image/webp;base64,BB']]);
  const withLqip = projectPublished(config, '1', lqip);
  assert(validatePublic(withLqip), JSON.stringify(validatePublic.errors));
  assert.equal(withLqip.site.avatarLqip, 'data:image/webp;base64,AA');
  assert.equal(withLqip.gallery.photos[0]!.lqip, 'data:image/webp;base64,BB');
});

test('password API schemas preserve the runtime grapheme and UTF-8 byte policy', async () => {
  const spec = await SwaggerParser.dereference(fileURLToPath(new URL('../contracts/openapi.json', import.meta.url)));
  const schemas = (spec as unknown as { components: { schemas: Record<string, object> } }).components.schemas;
  const ajv = new Ajv2020({ strict: false });
  const unicodePassword = 'a\u0301'.repeat(200);
  assert(ajv.compile(schemas.LoginRequest!)({ username: 'tester', password: unicodePassword }));
  assert(ajv.compile(schemas.PasswordRequest!)({ currentPassword: unicodePassword, newPassword: unicodePassword }));
});
