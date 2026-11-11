/** 访客菜单视图：文本 + inline 键盘，不直接调 Telegram。 */

import type { InlineKeyboardButton } from 'grammy/types';
import type { Config } from './config.ts';
import { t, type Lang } from './i18n.ts';

export type View = { text: string; keyboard: InlineKeyboardButton[][] };

function cb(text: string, data: string): InlineKeyboardButton {
  return { text, callback_data: data };
}

function link(text: string, url: string): InlineKeyboardButton {
  return { text, url };
}

export function menuView(lang: Lang, config: Config, admin = false): View {
  const keyboard: InlineKeyboardButton[][] = [
    [
      config.previewChannelUrl
        ? link(t(lang, 'btnPreview'), config.previewChannelUrl)
        : cb(t(lang, 'btnPreview'), 'm:unavailable:preview'),
      config.backupChannelUrl
        ? link(t(lang, 'btnBackup'), config.backupChannelUrl)
        : cb(t(lang, 'btnBackup'), 'm:unavailable:backup'),
    ],
  ];

  const second: InlineKeyboardButton[] = [];
  if (config.onlyfansUrl) second.push(cb(t(lang, 'btnOverseas'), 'm:overseas'));
  if (config.contactBotUrl) second.push(cb(t(lang, 'btnContact'), 'm:contact'));
  if (second.length) keyboard.push(second);

  keyboard.push([cb(t(lang, 'btnLanguage'), 'm:lang')]);

  const lines = [t(lang, 'menuTitle'), '', t(lang, 'menuSubtitle'), '', t(lang, 'rule')];
  if (admin) lines.push('', t(lang, 'adminHint'));
  return { text: lines.join('\n'), keyboard };
}

export function overseasView(lang: Lang, config: Config): View {
  return {
    text: t(lang, 'overseasBody'),
    keyboard: [[link(t(lang, 'overseasOpen'), config.onlyfansUrl!)], [cb(t(lang, 'btnBack'), 'm:menu')]],
  };
}

export function contactView(lang: Lang, config: Config): View {
  return {
    text: t(lang, 'contactBody'),
    keyboard: [[link(t(lang, 'contactOpen'), config.contactBotUrl!)], [cb(t(lang, 'btnBack'), 'm:menu')]],
  };
}
