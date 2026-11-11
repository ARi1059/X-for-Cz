import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoryFeed, parseChat, readStoryConfig, type StoryConfig } from '../src/server/story-feed.ts';
import { resetXApiCooldown } from '../src/server/x-api.ts';
import { resetTelegramApiCooldown } from '../src/server/telegram-api.ts';

const FIXED = Date.parse('2026-11-06T12:00:00Z');
const BOT_TOKEN = '123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

function config(overrides: Partial<StoryConfig> = {}): StoryConfig {
  return {
    x: { bearerToken: 'test-token', username: 'godfather' },
    telegram: { token: BOT_TOKEN, antiLossChat: '@anti_loss', previewChat: '@preview' },
    demo: false,
    ttlMs: 300_000,
    issues: [],
    ...overrides,
  };
}

type Handler = (url: URL) => Response | Promise<Response>;

function fakeFetch(handler: Handler): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
    return handler(url);
  }) as typeof fetch;
}

function liveXHandler(overrides: { tweets?: Response } = {}): Handler {
  return url => {
    if (url.pathname === '/2/users/by/username/godfather') {
      return Response.json({ data: { id: '42', username: 'godfather', public_metrics: { followers_count: 12345 } } });
    }
    if (url.pathname === '/2/users/42/tweets') {
      return overrides.tweets ?? Response.json({
        data: [
          { id: 't1', text: 'hello https://t.co/abc', created_at: '2026-11-05T10:00:00.000Z', attachments: { media_keys: ['m1'] } },
          { id: 't2', text: 'no media here', created_at: '2026-11-04T10:00:00.000Z' },
        ],
        includes: { media: [{ media_key: 'm1', type: 'photo', url: 'https://pbs.twimg.com/media/abc?format=jpg' }] },
      });
    }
    throw new Error(`unexpected X url ${url.pathname}`);
  };
}

function telegramHandler(counts: Record<string, number | Response>): Handler {
  return url => {
    if (url.pathname.startsWith('/bot')) {
      const chat = url.searchParams.get('chat_id') ?? '';
      const value = counts[chat];
      if (value instanceof Response) return value;
      if (typeof value === 'number') return Response.json({ ok: true, result: value });
    }
    throw new Error(`unexpected Telegram url ${url.pathname}`);
  };
}

test('live X and Telegram values build a feed without demo data', async () => {
  resetXApiCooldown();
  resetTelegramApiCooldown();
  const fetchImpl = fakeFetch(url => {
    if (url.hostname === 'api.x.com') return liveXHandler()(url);
    return telegramHandler({ '@anti_loss': 3400, '@preview': 1900 })(url);
  });
  const feed = await buildStoryFeed({ config: config(), fetchImpl, now: () => FIXED });

  assert.equal(feed.demo, false);
  assert.equal(feed.notice, null);
  assert.deepEqual(feed.stats.map(item => [item.key, item.count, item.state]), [
    ['x', 12345, 'live'],
    ['tg_anti', 3400, 'live'],
    ['tg_preview', 1900, 'live'],
  ]);
  assert.equal(feed.stats[0]!.display, '12.3K');
  assert.equal(feed.posts.length, 1);
  assert.equal(feed.posts[0]!.text, 'hello');
  assert.match(feed.posts[0]!.image, /name=small/);
  assert.equal(feed.posts[0]!.url, 'https://x.com/godfather/status/t1');
  assert.equal(feed.updatedAt, new Date(FIXED).toISOString());
});

test('a timeline permission error keeps follower stats and marks only posts unavailable', async () => {
  resetXApiCooldown();
  resetTelegramApiCooldown();
  const fetchImpl = fakeFetch(url => {
    if (url.hostname === 'api.x.com') return liveXHandler({ tweets: new Response('forbidden', { status: 403 }) })(url);
    return telegramHandler({ '@anti_loss': 10, '@preview': 20 })(url);
  });
  const feed = await buildStoryFeed({ config: config(), fetchImpl, now: () => FIXED });

  assert.equal(feed.stats[0]!.count, 12345);
  assert.equal(feed.stats[0]!.state, 'live');
  assert.deepEqual(feed.posts, []);
  assert.equal(feed.notice, 'X 最新内容暂不可用');
});

test('a posts-only cooldown does not hide followers on the next refresh', async () => {
  resetXApiCooldown();
  resetTelegramApiCooldown();
  let timelineCalls = 0;
  const fetchImpl = fakeFetch(url => {
    if (url.hostname === 'api.x.com') {
      if (url.pathname.endsWith('/tweets')) {
        timelineCalls += 1;
        return new Response('forbidden', { status: 403 });
      }
      return liveXHandler()(url);
    }
    return telegramHandler({ '@anti_loss': 10, '@preview': 20 })(url);
  });

  const first = await buildStoryFeed({ config: config(), fetchImpl, now: () => FIXED });
  assert.equal(first.stats[0]!.count, 12345);
  assert.equal(first.notice, 'X 最新内容暂不可用');

  const second = await buildStoryFeed({ config: config(), fetchImpl, now: () => FIXED });
  assert.equal(second.stats[0]!.count, 12345);
  assert.equal(second.stats[0]!.state, 'live');
  assert.deepEqual(second.posts, []);
  assert.equal(timelineCalls, 1, 'the timed-out timeline should not be retried during the cooldown');
});

test('a profile error degrades the X stat instead of failing the whole feed', async () => {
  resetXApiCooldown();
  resetTelegramApiCooldown();
  const fetchImpl = fakeFetch(url => {
    if (url.hostname === 'api.x.com') return new Response('forbidden', { status: 403 });
    return telegramHandler({ '@anti_loss': 10, '@preview': 20 })(url);
  });
  const feed = await buildStoryFeed({ config: config(), fetchImpl, now: () => FIXED });

  assert.equal(feed.stats[0]!.count, null);
  assert.equal(feed.stats[0]!.display, '—');
  assert.equal(feed.stats[0]!.state, 'unavailable');
  assert.equal(feed.notice, 'X 数据暂不可用');
  assert.equal(feed.stats[1]!.count, 10);
});

test('unconfigured production feed contains no sample numbers', async () => {
  const feed = await buildStoryFeed({ config: config({ x: null, telegram: null }), now: () => FIXED });
  assert.equal(feed.demo, false);
  assert.equal(feed.notice, '实时数据暂不可用');
  assert.deepEqual(feed.stats.map(item => item.count), [null, null, null]);
  assert.deepEqual(feed.posts, []);
});

test('development without credentials keeps the marked sample feed', async () => {
  const feed = await buildStoryFeed({ config: config({ x: null, telegram: null, demo: true }), now: () => FIXED });
  assert.equal(feed.demo, true);
  assert.equal(feed.stats[0]!.state, 'demo');
  assert.equal(feed.posts.length, 3);
  assert.match(feed.notice ?? '', /示例数据/);
  assert.equal(feed.updatedAt, new Date(FIXED).toISOString());
});

test('readStoryConfig normalizes handles, chat links and TTL', () => {
  const parsed = readStoryConfig({
    NODE_ENV: 'production',
    X_BEARER_TOKEN: 'token',
    X_USERNAME: '@Godfather',
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_ANTI_LOSS_CHAT: 'https://t.me/backup_channel',
    TELEGRAM_PREVIEW_CHAT: '-1001234567890',
    STORY_FEED_TTL_SECONDS: '600',
  });
  assert.deepEqual(parsed.x, { bearerToken: 'token', username: 'Godfather' });
  assert.deepEqual(parsed.telegram, { token: BOT_TOKEN, antiLossChat: '@backup_channel', previewChat: '-1001234567890' });
  assert.equal(parsed.ttlMs, 600_000);
  assert.equal(parsed.demo, false);
  assert.deepEqual(parsed.issues, []);
});

test('readStoryConfig reports malformed values without exposing secrets', () => {
  const parsed = readStoryConfig({
    NODE_ENV: 'production',
    X_BEARER_TOKEN: 'secret-token',
    X_USERNAME: 'bad handle!',
    TELEGRAM_BOT_TOKEN: 'not-a-token',
    STORY_FEED_TTL_SECONDS: '5',
  });
  assert.equal(parsed.x, null);
  assert.equal(parsed.telegram, null);
  assert.equal(parsed.ttlMs, 300_000);
  assert(parsed.issues.some(issue => issue.includes('X_USERNAME')));
  assert(parsed.issues.some(issue => issue.includes('TELEGRAM_BOT_TOKEN')));
  assert(parsed.issues.some(issue => issue.includes('STORY_FEED_TTL_SECONDS')));
  assert(parsed.issues.every(issue => !issue.includes('secret-token')));
});

test('parseChat accepts handles, t.me links and numeric ids', () => {
  assert.equal(parseChat('@backup'), '@backup');
  assert.equal(parseChat('backup'), '@backup');
  assert.equal(parseChat('https://t.me/backup'), '@backup');
  assert.equal(parseChat('https://t.me/backup/'), '@backup');
  assert.equal(parseChat('-1001234567890'), '-1001234567890');
  assert.equal(parseChat('https://example.com/backup'), null);
  assert.equal(parseChat(''), null);
});
