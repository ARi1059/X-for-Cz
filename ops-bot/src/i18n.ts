/** 访客菜单文案。中英键一一对应，缺键会在类型层报错。 */

export type Lang = 'zh' | 'en';

export function detectLang(languageCode: string | null | undefined): Lang {
  return (languageCode ?? '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function otherLang(lang: Lang): Lang {
  return lang === 'zh' ? 'en' : 'zh';
}

const zh = {
  menuTitle: '教父 · 入口',
  menuSubtitle: '每位主角，各自成章',
  rule: '仅限成年人。不约见，不私发免费全套。',
  btnPreview: '教父的战利品日记',
  btnBackup: '西西里安全屋',
  btnOverseas: '海外订阅',
  btnContact: '西西里线人',
  btnLanguage: '语言 / Language',
  btnBack: '返回',
  overseasBody: '海外订阅在 OnlyFans 完成，这里不收款。',
  overseasOpen: '打开 OnlyFans',
  contactBody: '西西里线人是独立的双向客服机器人，你的消息只经过它。\n\n请勿发送证件、银行卡、钱包私钥或任何密码。',
  contactOpen: '联系西西里线人',
  unavailable: '尚未开放',
  errorGeneric: '操作失败，请稍后再试。',
  adminHint: '管理：/pending /stats /report /announce',
} as const;

export type StringKey = keyof typeof zh;
export type Dictionary = Record<StringKey, string>;

const en: Dictionary = {
  menuTitle: 'Godfather · Access',
  menuSubtitle: 'Every story. Its own chapter.',
  rule: 'Adults only. No meet-ups. No free content.',
  btnPreview: 'Godfather’s Trophy Diary',
  btnBackup: 'Sicily Safehouse',
  btnOverseas: 'Overseas subscription',
  btnContact: 'Sicily Informant',
  btnLanguage: '语言 / Language',
  btnBack: 'Back',
  overseasBody: 'Overseas subscriptions are handled on OnlyFans. No payments here.',
  overseasOpen: 'Open OnlyFans',
  contactBody: 'Sicily Informant opens a separate support bot. Your messages go through it only.\n\nNever send ID documents, bank cards, wallet private keys or passwords.',
  contactOpen: 'Open Sicily Informant',
  unavailable: 'Not available yet',
  errorGeneric: 'Something went wrong. Please try again later.',
  adminHint: 'Admin: /pending /stats /report /announce',
};

export const dictionaries: Record<Lang, Dictionary> = { zh, en };

export function t(lang: Lang, key: StringKey): string {
  return dictionaries[lang][key];
}
