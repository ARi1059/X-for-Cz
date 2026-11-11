import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, loadConfig } from '../src/config.ts';

const base = {
  OPS_BOT_TOKEN: '123:test',
  OWNER_ID: '111',
  ADMIN_IDS: '222,333',
  PREVIEW_CHANNEL_ID: '-1001234567890',
  X_BEARER_TOKEN: 'bearer',
  X_USERNAME: '@gf',
};

test('解析必填项与默认值，owner 自动并入管理员', () => {
  const config = loadConfig(base);
  assert.equal(config.ownerId, 111);
  assert.deepEqual(config.adminIds, [111, 222, 333]);
  assert.equal(config.xUsername, 'gf');
  assert.equal(config.pollMinutes, 5);
  assert.equal(config.approvalTtlHours, 24);
  assert.equal(config.backfillCount, 0);
  assert.equal(config.timeZone, 'Asia/Shanghai');
  assert.equal(config.xApiRoot, 'https://api.x.com');
});

test('ADMIN_IDS 为空时只剩 owner', () => {
  const config = loadConfig({ ...base, ADMIN_IDS: '' });
  assert.deepEqual(config.adminIds, [111]);
});

test('缺少必填项时一次报出全部问题', () => {
  assert.throws(
    () => loadConfig({}),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.ok(error.issues.some(issue => issue.includes('OPS_BOT_TOKEN')));
      assert.ok(error.issues.some(issue => issue.includes('OWNER_ID')));
      assert.ok(error.issues.some(issue => issue.includes('PREVIEW_CHANNEL_ID')));
      assert.ok(error.issues.some(issue => issue.includes('X_BEARER_TOKEN')));
      assert.ok(error.issues.some(issue => issue.includes('X_USERNAME')));
      return true;
    },
  );
});

test('频道 ID 必须是 @username 或负数', () => {
  assert.throws(() => loadConfig({ ...base, PREVIEW_CHANNEL_ID: '100123' }), ConfigError);
  assert.equal(loadConfig({ ...base, PREVIEW_CHANNEL_ID: '@gf_preview' }).previewChannel, '@gf_preview');
});

test('轮询间隔与 TTL 越界会报错', () => {
  assert.throws(() => loadConfig({ ...base, POLL_MINUTES: '1' }), ConfigError);
  assert.throws(() => loadConfig({ ...base, APPROVAL_TTL_HOURS: '999' }), ConfigError);
});

test('X_ENABLED=0 时允许不填 X 凭据', () => {
  const config = loadConfig({ ...base, X_ENABLED: '0', X_BEARER_TOKEN: '', X_USERNAME: '' });
  assert.equal(config.xEnabled, false);
  assert.equal(config.xBearerToken, '');
});

test('访客菜单链接必须是 https，防丢频道 ID 必须是负数', () => {
  const config = loadConfig({
    ...base,
    PREVIEW_CHANNEL_URL: 'https://t.me/gf_preview',
    BACKUP_CHANNEL_ID: '-1009999999999',
    BACKUP_CHANNEL_URL: 'https://t.me/gf_backup',
    ONLYFANS_URL: 'https://onlyfans.com/gf',
    CONTACT_BOT_URL: 'https://t.me/gf_support',
  });
  assert.equal(config.previewChannelUrl, 'https://t.me/gf_preview');
  assert.equal(config.backupChannelId, -1009999999999);
  assert.equal(config.onlyfansUrl, 'https://onlyfans.com/gf');

  assert.throws(() => loadConfig({ ...base, PREVIEW_CHANNEL_URL: 'http://t.me/x' }), ConfigError);
  assert.throws(() => loadConfig({ ...base, BACKUP_CHANNEL_ID: '100999' }), ConfigError);
});

test('管理员列表里的非法 ID 会报错', () => {
  assert.throws(() => loadConfig({ ...base, ADMIN_IDS: '222,abc' }), ConfigError);
});
