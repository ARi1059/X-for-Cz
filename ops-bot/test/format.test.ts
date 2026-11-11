import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSeries, formatPost, formatTime, stripTracking } from '../src/format.ts';

const payload = {
  text: '系列 03 今天上新，完整版见会员频道 https://t.co/abc123',
  url: 'https://x.com/gf/status/123',
  createdAt: '2026-11-09T13:00:00.000Z',
  images: [],
  mediaKind: 'text' as const,
};

test('去 t.co 并提取系列号', () => {
  assert.equal(stripTracking(payload.text), '系列 03 今天上新，完整版见会员频道');
  assert.equal(extractSeries(payload.text), '系列 03');
  assert.equal(extractSeries('Series 7'), '系列 07');
  assert.equal(extractSeries('日常帖'), null);
});

test('固定头尾与北京时间', () => {
  const formatted = formatPost(payload);
  assert.match(formatted.html, /<b>🎬 新作 · 系列 03<\/b>/);
  assert.match(formatted.html, /🕘 2026-11-09 21:00/);
  assert.match(formatted.html, /🔞 仅限成年人 · 完整版尚未开放/);
  assert.doesNotMatch(formatted.html, /t\.co/);
  assert.equal(formatted.buttonUrl, 'https://x.com/gf/status/123');
});

test('HTML 转义', () => {
  const formatted = formatPost({ ...payload, text: 'a < b & c > d' });
  assert.match(formatted.html, /a &lt; b &amp; c &gt; d/);
});

test('正文截断到 300 字', () => {
  const long = '字'.repeat(400);
  const formatted = formatPost({ ...payload, text: long });
  assert.ok(formatted.html.includes('…'));
  assert.ok(!formatted.html.includes('字'.repeat(301)));
  assert.ok(formatted.html.includes('字'.repeat(300) + '…'));
});

test('转义膨胀时进一步缩短正文，caption 不超过 1024', () => {
  const formatted = formatPost({ ...payload, text: '&'.repeat(300) });
  assert.ok(formatted.html.length < 1024);
  assert.match(formatted.html, /&amp;/);
});

test('视频帖加一行提示', () => {
  const formatted = formatPost({ ...payload, text: '视频来了', mediaKind: 'video' });
  assert.match(formatted.html, /🎥 视频见原帖/);
});

test('非 X 链接不生成按钮', () => {
  const formatted = formatPost({ ...payload, url: 'https://example.com/post' });
  assert.equal(formatted.buttonUrl, '');
});

test('时间格式化', () => {
  assert.equal(formatTime('2026-11-09T13:00:00.000Z'), '2026-11-09 21:00');
  assert.equal(formatTime('bad'), '');
});
