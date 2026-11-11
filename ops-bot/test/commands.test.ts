import test from 'node:test';
import assert from 'node:assert/strict';
import { commandUpdate, createHarness, plainTextUpdate, tweet } from './support.ts';

test('非管理员发命令完全静默', async () => {
  const h = await createHarness();
  try {
    await h.bot.handleUpdate(commandUpdate(999, '/stats'));
    assert.equal(h.telegram.callsOf('sendMessage').length, 0);
  } finally {
    await h.close();
  }
});

test('管理员 /stats 返回成员与帖子统计', async () => {
  const now = Date.parse('2026-11-09T02:00:00.000Z');
  const h = await createHarness({}, () => now);
  try {
    h.store.setMemberCount('2026-11-09', 9);
    h.store.bumpJoin('2026-11-09');
    await h.bot.handleUpdate(commandUpdate(111, '/stats'));
    const messages = h.telegram.callsOf('sendMessage');
    assert.equal(messages.length, 1);
    assert.match(String(messages[0]?.params.text), /频道统计/);
    assert.match(String(messages[0]?.params.text), /当前成员：9/);
  } finally {
    await h.close();
  }
});

test('/report 手动触发日报', async () => {
  const now = Date.parse('2026-11-09T02:00:00.000Z');
  const h = await createHarness({ weeklyReport: null }, () => now);
  try {
    await h.bot.handleUpdate(commandUpdate(111, '/report'));
    assert.match(String(h.telegram.callsOf('sendMessage').at(-1)?.params.text), /已发送日报/);
    const reports = h.telegram.callsOf('sendMessage').filter(call => String(call.params.text).includes('频道日报'));
    assert.equal(reports.length, 2);
  } finally {
    await h.close();
  }
});

test('/pending 空队列与有待审两种文案', async () => {
  const h = await createHarness();
  try {
    await h.bot.handleUpdate(commandUpdate(111, '/pending'));
    assert.match(String(h.telegram.callsOf('sendMessage').at(-1)?.params.text), /没有待审/);

    h.xapi.setTweets([tweet('1001')]);
    await h.poller.runOnce();
    h.xapi.setTweets([tweet('1002'), tweet('1001')]);
    await h.poller.runOnce();

    await h.bot.handleUpdate(commandUpdate(111, '/pending'));
    const text = String(h.telegram.callsOf('sendMessage').at(-1)?.params.text);
    assert.match(text, /待审 1 条/);
    assert.match(text, /1002/);
  } finally {
    await h.close();
  }
});

test('/whoami 返回用户与会话 ID', async () => {
  const h = await createHarness();
  try {
    await h.bot.handleUpdate(commandUpdate(111, '/whoami'));
    const text = String(h.telegram.callsOf('sendMessage').at(-1)?.params.text);
    assert.match(text, /用户 ID：111/);
  } finally {
    await h.close();
  }
});

test('管理员发普通文本只得到操作提示', async () => {
  const h = await createHarness();
  try {
    await h.bot.handleUpdate(plainTextUpdate(111, 'hello'));
    const text = String(h.telegram.callsOf('sendMessage').at(-1)?.params.text);
    assert.match(text, /\/pending/);
  } finally {
    await h.close();
  }
});

test('非管理员发普通文本没有回复', async () => {
  const h = await createHarness();
  try {
    await h.bot.handleUpdate(plainTextUpdate(999, 'hello'));
    assert.equal(h.telegram.callsOf('sendMessage').length, 0);
  } finally {
    await h.close();
  }
});
