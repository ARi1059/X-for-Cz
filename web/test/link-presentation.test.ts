import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolvePrimaryLinkId } from '../src/components/link-presentation.ts';

const link = (id: string, available: boolean, emphasized = false) => ({ id, available, emphasized });

test('a fully closed site has no primary entry', () => {
  assert.equal(resolvePrimaryLinkId([]), null);
  assert.equal(resolvePrimaryLinkId([link('x_profile', false), link('tg_personal', false, true)]), null);
});

test('the emphasized available entry wins even when it is not first', () => {
  assert.equal(resolvePrimaryLinkId([
    link('x_profile', true),
    link('tg_personal', true),
    link('membership', true, true),
  ]), 'membership');
});

test('the first available entry takes over when no available entry is emphasized', () => {
  assert.equal(resolvePrimaryLinkId([
    link('x_profile', false, true),
    link('tg_personal', true),
    link('membership', true),
  ]), 'tg_personal');
});

test('the first available entry wins when several are emphasized', () => {
  assert.equal(resolvePrimaryLinkId([
    link('x_profile', true, true),
    link('tg_personal', true, true),
  ]), 'x_profile');
});

test('an emphasized but disabled entry never receives the accent', () => {
  assert.equal(resolvePrimaryLinkId([
    link('x_profile', false, true),
    link('tg_personal', true),
  ]), 'tg_personal');
});
