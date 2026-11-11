import test from 'node:test';
import assert from 'node:assert/strict';
import { callbackUpdate, createHarness, tweet } from './support.ts';
import type { FakeTweet } from './fake-x.ts';
import { CHANNEL_ID } from './fake-telegram.ts';

async function seedPending(h: Awaited<ReturnType<typeof createHarness>>, post: FakeTweet = tweet('1002')): Promise<void> {
  h.xapi.setTweets([tweet('1001')]);
  await h.poller.runOnce();
  h.xapi.setTweets([post, tweet('1001')]);
  await h.poller.runOnce();
}

function channelCalls(h: Awaited<ReturnType<typeof createHarness>>) {
  return h.telegram.calls.filter(call => Number(call.params.chat_id) === CHANNEL_ID);
}

test('管理员点发布后发到频道并记录 message_id', async () => {
  const h = await createHarness();
  try {
    await seedPending(h, {
      id: '1002',
      text: '系列 02',
      created_at: '2026-11-09T05:00:00.000Z',
      media: [{ type: 'photo', url: 'https://pbs.twimg.com/media/a.jpg' }],
    });
    await h.bot.handleUpdate(callbackUpdate(111, 'ap:1002'));

    const post = h.store.getPost('1002');
    assert.equal(post?.status, 'published');
    assert.ok(post?.messageId);

    const published = h.telegram.callsOf('sendPhoto').filter(call => String(call.params.chat_id) === String(CHANNEL_ID));
    assert.equal(published.length, 1);
    assert.match(String(published[0]?.params.caption), /系列 02/);
    assert.match(String(published[0]?.params.caption), /仅限成年人/);

    const markup = published[0]?.params.reply_markup as { inline_keyboard?: Array<Array<{ url?: string }>> };
    assert.equal(markup.inline_keyboard?.[0]?.[0]?.url, 'https://x.com/gf/status/1002');
  } finally {
    await h.close();
  }
});

test('第二个管理员再点不会重复发布', async () => {
  const h = await createHarness();
  try {
    await seedPending(h, {
      id: '1002',
      text: '系列 02',
      created_at: '2026-11-09T05:00:00.000Z',
      media: [{ type: 'photo', url: 'https://pbs.twimg.com/media/a.jpg' }],
    });
    await h.bot.handleUpdate(callbackUpdate(111, 'ap:1002'));
    const before = channelCalls(h).length;

    await h.bot.handleUpdate(callbackUpdate(222, 'ap:1002'));
    const after = channelCalls(h).length;
    assert.equal(after, before);
    assert.equal(h.store.getPost('1002')?.status, 'published');
  } finally {
    await h.close();
  }
});

test('点跳过不会发到频道', async () => {
  const h = await createHarness();
  try {
    await seedPending(h);
    await h.bot.handleUpdate(callbackUpdate(111, 'sk:1002'));

    assert.equal(h.store.getPost('1002')?.status, 'skipped');
    assert.equal(channelCalls(h).length, 0);
  } finally {
    await h.close();
  }
});

test('非管理员点按钮没有任何业务效果', async () => {
  const h = await createHarness();
  try {
    await seedPending(h);
    await h.bot.handleUpdate(callbackUpdate(999, 'ap:1002'));

    assert.equal(h.store.getPost('1002')?.status, 'pending');
    assert.equal(channelCalls(h).length, 0);
  } finally {
    await h.close();
  }
});

test('频道发送失败时标记 failed 并通知 owner', async () => {
  const h = await createHarness();
  try {
    await seedPending(h, {
      id: '1005',
      text: '系列 05',
      created_at: '2026-11-09T06:00:00.000Z',
      media: [{ type: 'photo', url: 'https://pbs.twimg.com/media/a.jpg' }],
    });
    h.telegram.setFail('sendPhoto');
    await h.bot.handleUpdate(callbackUpdate(111, 'ap:1005'));

    assert.equal(h.store.getPost('1005')?.status, 'failed');
    const notices = h.telegram.callsOf('sendMessage').filter(call => call.params.chat_id === 111 && String(call.params.text).includes('发布失败'));
    assert.equal(notices.length, 1);
  } finally {
    await h.close();
  }
});

test('纯文字帖用 sendMessage 发布', async () => {
  const h = await createHarness();
  try {
    await seedPending(h);
    await h.bot.handleUpdate(callbackUpdate(111, 'ap:1002'));

    const published = h.telegram.callsOf('sendMessage').filter(call => String(call.params.chat_id) === String(CHANNEL_ID));
    assert.equal(published.length, 1);
    assert.match(String(published[0]?.params.text), /系列 02/);
  } finally {
    await h.close();
  }
});

test('多图帖用 media group 发布', async () => {
  const h = await createHarness();
  try {
    await seedPending(h, {
      id: '1006',
      text: '系列 06',
      created_at: '2026-11-09T07:00:00.000Z',
      media: [
        { type: 'photo', url: 'https://pbs.twimg.com/media/a.jpg' },
        { type: 'photo', url: 'https://pbs.twimg.com/media/b.jpg' },
      ],
    });
    await h.bot.handleUpdate(callbackUpdate(111, 'ap:1006'));

    const groups = h.telegram.callsOf('sendMediaGroup').filter(call => String(call.params.chat_id) === String(CHANNEL_ID));
    assert.equal(groups.length, 1);
    const media = groups[0]?.params.media as Array<{ media: string; caption?: string }>;
    assert.equal(media.length, 2);
    assert.match(String(media[0]?.caption), /系列 06/);
    assert.equal(h.store.getPost('1006')?.status, 'published');
  } finally {
    await h.close();
  }
});
