/** 防丢频道公告的模板定义与拼装。纯函数，方便单独测试。 */

export type AnnounceTemplate = 'weekly' | 'entry' | 'outage';

export type Field = { label: string; hint: string };

export const TEMPLATE_TITLES: Record<AnnounceTemplate, string> = {
  weekly: '本周更新',
  entry: '入口变更',
  outage: '频道异常',
};

export const TEMPLATE_FIELDS: Record<AnnounceTemplate, readonly Field[]> = {
  weekly: [
    { label: '系列编号', hint: '例：系列 03' },
    { label: '上架时间', hint: '例：本周五 21:00' },
  ],
  entry: [
    { label: '入口名称', hint: '例：新预告频道' },
    { label: '入口地址', hint: 'https://t.me/...' },
    { label: '生效时间', hint: '例：即刻生效' },
  ],
  outage: [{ label: '情况说明', hint: '一句话说明当前情况' }],
};

export function isAnnounceTemplate(value: string): value is AnnounceTemplate {
  return value === 'weekly' || value === 'entry' || value === 'outage';
}

/** 入口地址必须是 https，避免把 http 或非链接发进公开频道。 */
export function validFieldValue(template: AnnounceTemplate, index: number, value: string): boolean {
  if (template === 'entry' && index === 1) {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }
  return true;
}

export function composeAnnouncement(template: AnnounceTemplate, values: readonly string[]): string {
  if (template === 'weekly') {
    const [series = '', time = ''] = values;
    return `本周更新 · ${series}\n\n上架时间：${time}（北京时间）\n\n完整内容在会员频道，入口见置顶。`;
  }
  if (template === 'entry') {
    const [label = '', url = '', time = ''] = values;
    return `入口变更\n\n${label}：${url}\n生效时间：${time}\n\n请以本频道公告为准。`;
  }
  const [note = ''] = values;
  return `会员频道暂时不可用。\n\n${note}\n\n恢复后会第一时间在本频道通知，请以本频道公告为准。`;
}
