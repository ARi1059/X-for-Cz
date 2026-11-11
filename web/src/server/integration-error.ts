/** 外部 API（X / Telegram）的统一错误类型。消息里不包含 token、请求 URL 或响应正文。 */

export type IntegrationSource = 'x' | 'telegram';

export type IntegrationErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'not_found'
  | 'invalid_chat'
  | 'network'
  | 'invalid_response';

export class IntegrationError extends Error {
  constructor(
    readonly source: IntegrationSource,
    readonly kind: IntegrationErrorKind,
    message: string,
    readonly retryAt: number | null = null,
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

export function toIntegrationError(error: unknown, source: IntegrationSource): IntegrationError {
  if (error instanceof IntegrationError) return error;
  return new IntegrationError(source, 'network', '外部 API 请求失败');
}
