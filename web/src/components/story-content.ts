/** Static editorial content for the scroll-narrative Lab. The production
 * version will move this into the published site config; the Lab keeps the
 * copy in one typed module so it is easy to review and replace. */

import { BRAND } from '../brand';

export type StorySection = {
  id: 'meet' | 'about' | 'preview' | 'membership' | 'purchase';
  kicker: string;
  title: string;
  nav: string;
};

export const STORY_SECTIONS: StorySection[] = [
  { id: 'meet', kicker: '01 / FIND ME HERE', title: '与我相遇', nav: '与我相遇' },
  { id: 'about', kicker: '02 / ABOUT', title: '教父主理', nav: '教父主理' },
  { id: 'preview', kicker: '03 / PREVIEW', title: BRAND.channels.preview, nav: '预览档案' },
  { id: 'membership', kicker: '04 / MEMBERSHIP', title: BRAND.channels.membership, nav: '会员档案' },
  { id: 'purchase', kicker: '05 / HOW TO JOIN', title: '缄默法则通行证', nav: '购买方式' },
];

export const STORY_BIO = BRAND.bio;

export type StoryStatState = 'live' | 'demo' | 'unavailable';

export type StoryStat = {
  key: string;
  label: string;
  count: number | null;
  display: string;
  updatedAt: string;
  source: string;
  state: StoryStatState;
};

export type StoryPost = {
  id: string;
  text: string;
  url: string | null;
  image: string;
  mediaType: 'image' | 'video';
  createdAt: string;
  demo: boolean;
};

export type StoryFeed = {
  stats: StoryStat[];
  posts: StoryPost[];
  updatedAt: string;
  demo: boolean;
  notice: string | null;
};

export const MEMBERSHIP_BENEFITS = [
  '会员频道全部内容',
  '多位成年主角，各自独立系列',
  '更新与服务范围以当前套餐为准',
  '一次性加入链接，仅本人可用',
];

export type MembershipTier = {
  id: string;
  name: string;
  period: string;
  note: string;
  featured: boolean;
};

export const MEMBERSHIP_TIERS: MembershipTier[] = [
  { id: 'month', name: '单月会员', period: '30 天', note: '到期 Bot 自动移出', featured: false },
  { id: 'quarter', name: '季度会员', period: '90 天', note: '到期 Bot 自动移出', featured: false },
  { id: 'year', name: '年费会员', period: '365 天', note: '到期 Bot 自动移出', featured: false },
  { id: 'lifetime', name: '永久会员', period: '永久', note: '一次加入，不再移出', featured: true },
];

export type PurchaseStep = { title: string; body: string };

export const PURCHASE_STEPS: PurchaseStep[] = [
  { title: '打开 Telegram Bot，选择档位', body: '在 Bot 内选择单月 / 季度 / 年费 / 永久会员，确认当前 USDT 报价。' },
  { title: '按 Bot 显示的地址转账', body: '只使用 Bot 内显示的 USDT 地址和网络；转账金额、网络与备注以 Bot 为准。' },
  { title: '提交交易哈希，等待确认', body: '把交易哈希发给 Bot，等待链上确认；不要向任何人私下转账。' },
  { title: '获取一次性加入链接', body: '确认后 Bot 发出一条仅允许一人使用的频道邀请链接；点击加入会员频道。' },
  { title: '到期自动移出', body: '单月 / 季度 / 年费会员到期后由 Bot 自动移出频道；永久会员不再移出。' },
];

export const PURCHASE_FAQ = [
  { q: '可以用银行卡或其他方式吗？', a: '本期只提供 USDT + Telegram Bot 的方式；站内不收款、不保存任何支付信息。' },
  { q: '转账后多久开通？', a: '以链上确认和 Bot 处理为准；通常几分钟内，网络拥堵时会更久。' },
  { q: '邀请链接可以转发吗？', a: '不可以。一次性链接仅允许一人加入；转发或泄露会导致链接失效。' },
  { q: '到期会自动续费吗？', a: '不会。到期后 Bot 自动移出，需要重新在 Bot 内下单。' },
  { q: '怎么确认 Bot 是真的？', a: '只从本站「会员购买」入口进入；只使用 Bot 内显示的地址，不向私信中的地址转账。' },
];

export const STORY_SOURCES = '数据来自 X 与 Telegram 公开指标；OnlyFans 不展示、不抓取。';

const demoTime = new Date(Date.now() - 12 * 60 * 1000).toISOString();

export const FALLBACK_STATS: StoryStat[] = [
  { key: 'x', label: 'X 粉丝', count: 12800, display: '12.8K', updatedAt: demoTime, source: 'X API', state: 'demo' },
  { key: 'tg_anti', label: BRAND.channels.backup, count: 3400, display: '3.4K', updatedAt: demoTime, source: 'Telegram', state: 'demo' },
  { key: 'tg_preview', label: BRAND.channels.preview, count: 1900, display: '1.9K', updatedAt: demoTime, source: 'Telegram', state: 'demo' },
];

export const FALLBACK_POSTS: StoryPost[] = [
  { id: 'demo-1', text: '最新预告 · 新片片段', url: null, image: '/lusion/02.jpg', mediaType: 'video', createdAt: demoTime, demo: true },
  { id: 'demo-2', text: '本周更新 · 会员抢先看', url: null, image: '/lusion/03.jpg', mediaType: 'image', createdAt: demoTime, demo: true },
  { id: 'demo-3', text: '拍摄花絮 · 预告频道', url: null, image: '/lusion/04.jpg', mediaType: 'image', createdAt: demoTime, demo: true },
];

export const FALLBACK_FEED: StoryFeed = {
  stats: FALLBACK_STATS,
  posts: FALLBACK_POSTS,
  updatedAt: demoTime,
  demo: true,
  notice: '示例数据 · 配置 X / Telegram API 后自动更新',
};

/** 首屏与生产环境未接入时的空态；不展示任何示例数字。 */
export const EMPTY_FEED: StoryFeed = {
  stats: FALLBACK_STATS.map(item => ({ ...item, count: null, display: '—', state: 'unavailable' })),
  posts: [],
  updatedAt: demoTime,
  demo: false,
  notice: null,
};

export function formatCount(count: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(count);
}

export function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
