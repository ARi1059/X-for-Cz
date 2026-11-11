/** Public identity. Handles and payment settings belong to runtime configuration. */
export const BRAND = {
  name: '教父',
  wordmark: 'THE GODFATHER',
  monogram: 'GF',
  tagline: '每位主角，各自成章',
  description: '男性主理人教父，呈现多位成年女性各自鲜明的风格企划。',
  bio: '我是教父，负责策划、拍摄和记录不同主角的风格企划。每位成年女主都有自己的气质与系列，这里汇集作品预览、会员入口和官方公告。',
  channels: { preview: '教父的战利品日记', membership: '缄默法则之下', backup: '西西里安全屋' },
  bots: { storage: '💎 军火走私船', payment: '🗝️ 缄默法则通行证', contact: '西西里线人' },
  linkLabels: {
    x_profile: '教父 · X', tg_personal: '西西里安全屋', tg_preview: '教父的战利品日记',
    onlyfans: 'OnlyFans', membership: '🗝️ 缄默法则通行证',
  },
} as const;
