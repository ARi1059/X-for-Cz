/** 测试用 Telegram Bot API 假服务：记录调用，按方法返回最小合法结果。 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type ApiCall = { method: string; params: Record<string, unknown> };

export type FakeTelegram = {
  apiRoot: string;
  calls: ApiCall[];
  find(method: string): ApiCall | undefined;
  callsOf(method: string): ApiCall[];
  setFail(method: string | null): void;
  setMemberCount(count: number): void;
  close(): Promise<void>;
};

const BOT_ID = 42;
const CHANNEL_ID = -1001234567890;

function reply(res: import('node:http').ServerResponse, result: unknown): void {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ ok: true, result }));
}

export async function startFakeTelegram(): Promise<FakeTelegram> {
  const calls: ApiCall[] = [];
  let messageId = 1000;
  let failMethod: string | null = null;
  let memberCount = 2;

  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const method = url.pathname.split('/').pop() ?? '';
      const params = body ? (JSON.parse(body) as Record<string, unknown>) : {};
      calls.push({ method, params });
      const now = Math.floor(Date.now() / 1000);
      const chatId = Number(params.chat_id ?? CHANNEL_ID);

      if (failMethod === method) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request: test failure' }));
        return;
      }

      switch (method) {
        case 'getMe':
          reply(res, {
            id: BOT_ID,
            is_bot: true,
            first_name: 'Godfather Ops',
            username: 'GodfatherOpsBot',
            can_join_groups: false,
            can_read_all_group_messages: false,
            supports_inline_queries: false,
          });
          return;
        case 'getChat':
          reply(res, { id: CHANNEL_ID, type: 'channel', title: '预告频道' });
          return;
        case 'getChatMemberCount':
          reply(res, memberCount);
          return;
        case 'getChatMember':
          reply(res, {
            status: 'administrator',
            user: { id: BOT_ID, is_bot: true, first_name: 'Godfather Ops' },
            can_be_edited: false,
            is_anonymous: false,
            can_manage_chat: true,
            can_delete_messages: true,
            can_manage_video_chats: false,
            can_restrict_members: false,
            can_promote_members: false,
            can_change_info: false,
            can_invite_users: true,
            can_post_messages: true,
            can_edit_messages: true,
            can_pin_messages: false,
            can_manage_topics: false,
          });
          return;
        case 'sendMessage':
          messageId += 1;
          reply(res, {
            message_id: messageId,
            date: now,
            chat: { id: chatId, type: chatId < 0 ? 'channel' : 'private' },
            text: params.text,
          });
          return;
        case 'sendPhoto':
          messageId += 1;
          reply(res, {
            message_id: messageId,
            date: now,
            chat: { id: chatId, type: chatId < 0 ? 'channel' : 'private' },
            photo: [{ file_id: 'photo', file_unique_id: 'u', width: 100, height: 100 }],
            caption: params.caption,
          });
          return;
        case 'sendMediaGroup': {
          const media = (params.media as unknown[] | undefined) ?? [];
          const messages = media.map(() => {
            messageId += 1;
            return {
              message_id: messageId,
              date: now,
              chat: { id: chatId, type: chatId < 0 ? 'channel' : 'private' },
              photo: [{ file_id: 'photo', file_unique_id: 'u', width: 100, height: 100 }],
            };
          });
          reply(res, messages);
          return;
        }
        case 'editMessageText':
          reply(res, {
            message_id: params.message_id,
            date: now,
            chat: { id: chatId, type: 'private' },
            text: params.text,
          });
          return;
        case 'editMessageCaption':
          reply(res, {
            message_id: params.message_id,
            date: now,
            chat: { id: chatId, type: 'private' },
            photo: [{ file_id: 'photo', file_unique_id: 'u', width: 100, height: 100 }],
            caption: params.caption,
          });
          return;
        default:
          reply(res, true);
      }
    });
  });

  const sockets = new Set<import('node:net').Socket>();
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const port = (server.address() as AddressInfo).port;

  return {
    apiRoot: `http://127.0.0.1:${port}`,
    calls,
    find: method => calls.find(call => call.method === method),
    callsOf: method => calls.filter(call => call.method === method),
    setFail(method) {
      failMethod = method;
    },
    setMemberCount(count) {
      memberCount = count;
    },
    close: () =>
      new Promise<void>(resolveClose => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolveClose());
      }),
  };
}

export { BOT_ID, CHANNEL_ID };
