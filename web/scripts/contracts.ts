import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import { z } from 'zod';
import { siteConfigSchema, parseSiteConfig, validateForPublish } from '../src/contracts/site-config.ts';
import { initialConfigFromDesign, mediaImportManifest } from '../src/contracts/initial-config.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
if (!['--write', '--check'].includes(mode ?? '')) throw new Error('Use --write or --check');
const copy = JSON.parse(await readFile(resolve(root, 'config/content-base.json'), 'utf8'));
const schema = z.toJSONSchema(siteConfigSchema, { target: 'draft-2020-12' });
const config = initialConfigFromDesign(copy);
const outputs: Record<string, unknown> = {
  'contracts/site-config.schema.json': schema,
  'config/initial-site.json': config,
  'config/media-import-manifest.json': mediaImportManifest(copy),
};
for (const [name, value] of Object.entries(outputs)) {
  const path = resolve(root, name);
  const expected = JSON.stringify(value, null, 2) + '\n';
  if (mode === '--write') { await mkdir(dirname(path), { recursive: true }); await writeFile(path, expected); }
  else assert.equal(await readFile(path, 'utf8'), expected, `${name} differs; run npm run contracts:generate`);
}
parseSiteConfig(config);
assert.equal(config.links.length, 5);
assert(config.links.every(link => link.url === null && !link.enabled));
const publishIssues = validateForPublish(config);
assert(publishIssues.some(issue => issue.path === 'ageGate.exitUrl'));
assert(publishIssues.some(issue => issue.path === 'footer.contactEmail'));
assert(publishIssues.some(issue => issue.code === 'NO_ACTIVE_LINK'));
if (mode === '--check') {
  const spec = await SwaggerParser.validate(resolve(root, 'contracts/openapi.json'));
  assert.equal((spec as unknown as { openapi: string }).openapi, '3.1.0');
  const operationIds = Object.values(spec.paths ?? {}).flatMap(path => Object.entries(path ?? {})
    .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
    .map(([, operation]) => (operation as { operationId?: string }).operationId));
  assert(operationIds.every(Boolean));
  assert.equal(new Set(operationIds).size, operationIds.length);
  console.log(`OPENAPI_OK: ${operationIds.length} operations; references resolved and schema validated`);
}
console.log('CONTENT_OK: content baseline matches generated schema/seed; five targets disabled; real publishing remains blocked');
console.log(`MEDIA_OK: ${copy.photos.length} brand source listed for controlled import; bootstrap includes no media`);
