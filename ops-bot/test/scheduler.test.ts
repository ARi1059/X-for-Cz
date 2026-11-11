import test from 'node:test';
import assert from 'node:assert/strict';
import { localParts } from '../src/scheduler.ts';
import { createHarness } from './support.ts';

const MON_10 = Date.parse('2026-11-09T02:00:00.000Z'); // 北京时间周一 10:00

test('按配置时区解析本地日期与星期', () => {
  assert.deepEqual(localParts(MON_10, 'Asia/Shanghai'), {
    day: '2026-11-09',
    hour: 10,
    minute: 0,
    weekday: 1,
  });
});

test('日报在 10:00 发给全部管理员，当天只发一次', async () => {
  const h = await createHarness({ weeklyReport: null }, () => MON_10);
  try {
    h.telegram.setMemberCount(100);
    h.store.bumpJoin('2026-11-08', 'https://t.me/+x');
    h.store.bumpLeave('2026-11-08');

    await h.scheduler.tick(MON_10);
    const reports = h.telegram.callsOf('sendMessage').filter(call => String(call.params.text).includes('频道日报'));
    assert.equal(reports.length, 2);
    assert.match(String(reports[0]?.params.text), /当前成员：100/);
    assert.match(String(reports[0]?.params.text), /昨日新增：1/);
    assert.match(String(reports[0]?.params.text), /退出：1/);
    assert.equal(h.store.metaValue('report_daily_last'), '2026-11-09');

    await h.scheduler.tick(MON_10);
    const again = h.telegram.callsOf('sendMessage').filter(call => String(call.params.text).includes('频道日报'));
    assert.equal(again.length, 2);
  } finally {
    await h.close();
  }
});

test('周报在周一 10:00 发送并汇总 7 天来源', async () => {
  const h = await createHarness({ dailyReport: null }, () => MON_10);
  try {
    h.store.bumpJoin('2026-11-08', 'https://t.me/+x');
    h.store.bumpJoin('2026-11-08', 'https://t.me/+x');
    h.store.bumpJoin('2026-11-08', 'https://t.me/+x');

    await h.scheduler.tick(MON_10);
    const reports = h.telegram.callsOf('sendMessage').filter(call => String(call.params.text).includes('频道周报'));
    assert.equal(reports.length, 2);
    assert.match(String(reports[0]?.params.text), /本周新增：3/);
    assert.match(String(reports[0]?.params.text), /\+x \+3/);
    assert.equal(h.store.metaValue('report_weekly_last'), '2026-11-09');
  } finally {
    await h.close();
  }
});

test('定时任务会刷新当前成员数', async () => {
  const h = await createHarness({ dailyReport: null, weeklyReport: null }, () => MON_10);
  try {
    h.telegram.setMemberCount(77);
    await h.scheduler.tick(MON_10);
    assert.equal(h.store.memberDay('2026-11-09').members, 77);
    assert.ok(h.telegram.find('getChatMemberCount'));
  } finally {
    await h.close();
  }
});
