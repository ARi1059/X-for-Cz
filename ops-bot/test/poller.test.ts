import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, tweet } from './support.ts';

test('首次轮询只记录基线，不发预览', async () => {
  const h = await createHarness();
  try {
    h.xapi.setTweets([
      { id: '1002', text: '系列 02 旧帖', created_at: '2026-11-09T05:00:00.000Z' },
      { id: '1001', text: '系列 01 旧帖', created_at: '2026-11-09T04:00:00.000Z' },
    ]);
    const summary = await h.poller.runOnce();
    assert.equal(summary.checked, 2);
    assert.equal(summary.enqueued, 0);
    assert.equal(h.store.getPost('1001')?.status, 'baseline');
    assert.equal(h.store.getPost('1002')?.status, 'baseline');
    assert.equal(h.telegram.callsOf('sendMessage').length, 0);
    assert.equal(h.telegram.callsOf('sendPhoto').length, 0);
  } finally {
    await h.close();
  }
});

test('新帖入队并给每个管理员发预览，重复轮询不重发', async () => {
  const h = await createHarness();
  try {
    h.xapi.setTweets([tweet('1001')]);
    await h.poller.runOnce();

    h.xapi.setTweets([tweet('1002'), tweet('1001')]);
    const summary = await h.poller.runOnce();
    assert.equal(summary.enqueued, 1);
    assert.equal(h.store.getPost('1002')?.status, 'pending');

    const previews = h.telegram.callsOf('sendMessage').filter(call => call.params.chat_id === 111 || call.params.chat_id === 222);
    assert.equal(previews.length, 2);
    assert.match(String(previews[0]?.params.text), /系列/);

    const again = await h.poller.runOnce();
    assert.equal(again.enqueued, 0);
    const after = h.telegram.callsOf('sendMessage').filter(call => call.params.chat_id === 111 || call.params.chat_id === 222);
    assert.equal(after.length, 2);
  } finally {
    await h.close();
  }
});

test('回填配置只把最近 N 条入队', async () => {
  const h = await createHarness({ backfillCount: 2 });
  try {
    h.xapi.setTweets([
      { id: '1003', text: '系列 03', created_at: '2026-11-09T06:00:00.000Z' },
      { id: '1002', text: '系列 02', created_at: '2026-11-09T05:00:00.000Z' },
      { id: '1001', text: '系列 01', created_at: '2026-11-09T04:00:00.000Z' },
    ]);
    const summary = await h.poller.runOnce();
    assert.equal(summary.enqueued, 2);
    assert.equal(h.store.getPost('1001')?.status, 'baseline');
    assert.equal(h.store.getPost('1002')?.status, 'pending');
    assert.equal(h.store.getPost('1003')?.status, 'pending');
  } finally {
    await h.close();
  }
});

test('X 返回 403 时告警 owner 且不崩溃', async () => {
  const h = await createHarness();
  try {
    h.xapi.setError(403);
    const summary = await h.poller.runOnce();
    assert.ok(summary.error);
    const alerts = h.telegram.callsOf('sendMessage').filter(call => call.params.chat_id === 111);
    assert.equal(alerts.length, 1);
    assert.match(String(alerts[0]?.params.text), /X 读取失败/);
  } finally {
    await h.close();
  }
});

test('超过 24 小时的待审会被标记过期', async () => {
  let now = Date.parse('2026-11-09T04:00:00.000Z');
  const h = await createHarness({}, () => now);
  try {
    h.xapi.setTweets([tweet('1001')]);
    await h.poller.runOnce();

    now += 1000;
    h.xapi.setTweets([tweet('1002'), tweet('1001')]);
    await h.poller.runOnce();
    assert.equal(h.store.getPost('1002')?.status, 'pending');

    now += 25 * 3_600_000;
    await h.poller.runOnce();
    assert.equal(h.store.getPost('1002')?.status, 'expired');
    const edits = h.telegram.callsOf('editMessageText');
    assert.ok(edits.some(call => String(call.params.text).includes('已过期')));
  } finally {
    await h.close();
  }
});
