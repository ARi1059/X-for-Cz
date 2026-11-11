import test from 'node:test';
import assert from 'node:assert/strict';
import { chatMemberUpdate, createHarness } from './support.ts';

const MON_10 = Date.parse('2026-11-09T02:00:00.000Z');

test('成员加入时累计新增并记录邀请来源', async () => {
  const h = await createHarness({}, () => MON_10);
  try {
    await h.bot.handleUpdate(chatMemberUpdate(555, { old: 'left', new: 'member', link: 'https://t.me/+abc' }));
    assert.equal(h.store.memberDay('2026-11-09').joins, 1);
    assert.deepEqual(h.store.inviteSources('2026-11-09'), [{ link: 'https://t.me/+abc', joins: 1 }]);
  } finally {
    await h.close();
  }
});

test('成员退出时累计退出，不重复计算未变化状态', async () => {
  const h = await createHarness({}, () => MON_10);
  try {
    await h.bot.handleUpdate(chatMemberUpdate(555, { old: 'member', new: 'left' }));
    await h.bot.handleUpdate(chatMemberUpdate(555, { old: 'member', new: 'member' }));
    assert.equal(h.store.memberDay('2026-11-09').leaves, 1);
    assert.equal(h.store.memberDay('2026-11-09').joins, 0);
  } finally {
    await h.close();
  }
});

test('其他频道的成员变化不计入', async () => {
  const h = await createHarness({}, () => MON_10);
  try {
    await h.bot.handleUpdate(
      chatMemberUpdate(555, { old: 'left', new: 'member', chatId: -1009999999999 }),
    );
    assert.equal(h.store.memberDay('2026-11-09').joins, 0);
  } finally {
    await h.close();
  }
});
