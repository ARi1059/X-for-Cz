import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callbackUpdate,
  commandUpdate,
  createHarness,
  keyboardOf,
  plainTextUpdate,
} from './support.ts';

test('访客 /start 直接出菜单：无年龄门、无本周内容、无会员购买', async () => {
  const h = await createHarness();
  try {
    await h.bot.handleUpdate(commandUpdate(999, '/start'));
    const message = h.telegram.callsOf('sendMessage').at(-1)!;
    const text = String(message.params.text);
    assert.match(text, /教父 · 入口/);
    assert.match(text, /仅限成年人/);
    assert.doesNotMatch(text, /18 岁|本周内容|会员购买/);

    const labels = keyboardOf(message.params).flat().map(item => item.text);
    assert.deepEqual(labels, ['教父的战利品日记', '西西里安全屋', '海外订阅', '西西里线人', '语言 / Language']);
  } finally {
    await h.close();
  }
});

test('未配置的入口：海外订阅与联系客服隐藏，频道按钮降级为提示', async () => {
  const h = await createHarness({
    previewChannelUrl: null,
    backupChannelUrl: null,
    onlyfansUrl: null,
    contactBotUrl: null,
  });
  try {
    await h.bot.handleUpdate(commandUpdate(999, '/start'));
    const message = h.telegram.callsOf('sendMessage').at(-1)!;
    const buttons = keyboardOf(message.params).flat();
    assert.deepEqual(buttons.map(item => item.text), ['教父的战利品日记', '西西里安全屋', '语言 / Language']);
    assert.equal(buttons[0]?.callback_data, 'm:unavailable:preview');
    assert.equal(buttons[1]?.callback_data, 'm:unavailable:backup');
  } finally {
    await h.close();
  }
});

test('语言切换持久化，下次 /start 仍是英文', async () => {
  const h = await createHarness();
  try {
    await h.bot.handleUpdate(commandUpdate(999, '/start', 'zh-CN'));
    await h.bot.handleUpdate(callbackUpdate(999, 'm:lang'));

    const edited = h.telegram.callsOf('editMessageText').at(-1)!;
    assert.match(String(edited.params.text), /Godfather · Access/);
    assert.equal(h.store.getUser(999)?.lang, 'en');

    await h.bot.handleUpdate(commandUpdate(999, '/start', 'zh-CN'));
    const again = h.telegram.callsOf('sendMessage').at(-1)!;
    assert.match(String(again.params.text), /Godfather · Access/);
  } finally {
    await h.close();
  }
});

test('联系客服先说明再跳转，消息不落库', async () => {
  const h = await createHarness();
  try {
    await h.bot.handleUpdate(commandUpdate(999, '/start'));
    await h.bot.handleUpdate(callbackUpdate(999, 'm:contact'));

    const edited = h.telegram.callsOf('editMessageText').at(-1)!;
    assert.match(String(edited.params.text), /客服机器人/);
    const buttons = keyboardOf(edited.params).flat();
    assert.equal(buttons[0]?.url, 'https://t.me/gf_support');
  } finally {
    await h.close();
  }
});

test('管理员公告：模板 → 字段 → 预览 → 确认发到防丢频道', async () => {
  const h = await createHarness();
  try {
    await h.bot.handleUpdate(commandUpdate(111, '/announce'));
    const templates = keyboardOf(h.telegram.callsOf('sendMessage').at(-1)!.params).flat();
    assert.deepEqual(templates.map(item => item.text), ['本周更新', '入口变更', '频道异常', '取消']);

    await h.bot.handleUpdate(callbackUpdate(111, 'an:t:weekly'));
    await h.bot.handleUpdate(plainTextUpdate(111, '系列 03'));
    await h.bot.handleUpdate(plainTextUpdate(111, '本周五 21:00'));

    const preview = h.telegram.callsOf('sendMessage').at(-1)!;
    assert.match(String(preview.params.text), /公告预览/);
    assert.match(String(preview.params.text), /本周更新 · 系列 03/);

    await h.bot.handleUpdate(callbackUpdate(111, 'an:confirm'));
    const published = h.telegram.callsOf('sendMessage').filter(
      call => String(call.params.chat_id) === '-1009999999999',
    );
    assert.equal(published.length, 1);
    assert.match(String(published[0]?.params.text), /本周更新 · 系列 03/);
  } finally {
    await h.close();
  }
});

test('非管理员发 /announce 或点公告按钮没有回复', async () => {
  const h = await createHarness();
  try {
    await h.bot.handleUpdate(commandUpdate(999, '/announce'));
    await h.bot.handleUpdate(callbackUpdate(999, 'an:t:weekly'));
    assert.equal(h.telegram.callsOf('sendMessage').length, 0);
  } finally {
    await h.close();
  }
});

test('管理员 /start 额外显示管理命令提示', async () => {
  const h = await createHarness();
  try {
    await h.bot.handleUpdate(commandUpdate(111, '/start'));
    const text = String(h.telegram.callsOf('sendMessage').at(-1)?.params.text);
    assert.match(text, /\/announce/);
  } finally {
    await h.close();
  }
});
