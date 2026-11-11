import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.ts';
import { Store } from '../src/store.ts';
import type { PostPayload } from '../src/format.ts';

const payload: PostPayload = {
  text: '系列 01',
  url: 'https://x.com/gf/status/1',
  createdAt: '2026-11-09T00:00:00.000Z',
  images: [],
  mediaKind: 'text',
};

function store(): Store {
  return new Store(openDatabase(':memory:'));
}

test('同一推文只插入一次', () => {
  const s = store();
  assert.equal(s.insertPost('1', 'pending', payload, 1000), true);
  assert.equal(s.insertPost('1', 'pending', payload, 2000), false);
  assert.equal(s.getPost('1')?.status, 'pending');
});

test('认领是原子的，第二个管理员点不动', () => {
  const s = store();
  s.insertPost('1', 'pending', payload, 1000);
  assert.equal(s.claim('1', 111, 2000), true);
  assert.equal(s.getPost('1')?.status, 'publishing');
  assert.equal(s.claim('1', 222, 3000), false);
});

test('发布成功后写入 message_id', () => {
  const s = store();
  s.insertPost('1', 'pending', payload, 1000);
  s.claim('1', 111, 2000);
  s.finishPublished('1', 9001, 3000);
  const post = s.getPost('1');
  assert.equal(post?.status, 'published');
  assert.equal(post?.messageId, 9001);
  assert.equal(s.counts().published, 1);
});

test('跳过只能从 pending 发生', () => {
  const s = store();
  s.insertPost('1', 'pending', payload, 1000);
  assert.equal(s.markSkipped('1', 111, 2000), true);
  assert.equal(s.markSkipped('1', 222, 3000), false);
  assert.equal(s.getPost('1')?.status, 'skipped');
});

test('过期只处理超过 TTL 的 pending', () => {
  const s = store();
  s.insertPost('old', 'pending', payload, 1000);
  s.insertPost('new', 'pending', payload, 9000);
  assert.deepEqual(s.expirePending(5000, 10_000), ['old']);
  assert.equal(s.getPost('old')?.status, 'expired');
  assert.equal(s.getPost('new')?.status, 'pending');
});

test('成员日报累计新增、退出与来源', () => {
  const s = store();
  s.setMemberCount('2026-11-09', 100);
  s.bumpJoin('2026-11-09', 'https://t.me/+a');
  s.bumpJoin('2026-11-09', 'https://t.me/+a');
  s.bumpJoin('2026-11-09', null);
  s.bumpLeave('2026-11-09');
  assert.deepEqual(s.memberDay('2026-11-09'), { day: '2026-11-09', members: 100, joins: 3, leaves: 1 });
  assert.deepEqual(s.inviteSources('2026-11-09'), [{ link: 'https://t.me/+a', joins: 2 }]);
});

test('访客语言持久化，重复 /start 不覆盖', () => {
  const s = store();
  s.ensureUser(999, 'zh', 1000);
  s.setLang(999, 'en', 2000);
  assert.equal(s.getUser(999)?.lang, 'en');
  s.ensureUser(999, 'zh', 3000);
  assert.equal(s.getUser(999)?.lang, 'en');
});

test('预览消息可保存与读取', () => {
  const s = store();
  s.insertPost('1', 'pending', payload, 1000);
  s.savePreview('1', 111, 500);
  s.savePreview('1', 111, 501);
  assert.deepEqual(s.previewsFor('1'), [{ adminId: 111, messageId: 501 }]);
});
