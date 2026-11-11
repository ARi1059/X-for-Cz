/** 测试用 X API 假服务：用户查询与时间线，可注入错误。 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeMedia = { type: 'photo' | 'video'; url?: string; preview_image_url?: string };
export type FakeTweet = { id: string; text: string; created_at: string; media?: FakeMedia[] };
export type FakeX = {
  root: string;
  calls: string[];
  setTweets(tweets: FakeTweet[]): void;
  setError(status: number | null): void;
  close(): Promise<void>;
};

const USER_ID = '777';

function reply(res: import('node:http').ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
}

export async function startFakeX(username = 'gf'): Promise<FakeX> {
  const calls: string[] = [];
  let tweets: FakeTweet[] = [];
  let errorStatus: number | null = null;

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    calls.push(url.pathname);

    if (errorStatus !== null) {
      reply(res, errorStatus, {
        title: 'Client Forbidden',
        type: 'https://api.x.com/2/problems/client-forbidden',
        detail: 'test error',
        reason: 'client-not-enrolled',
      });
      return;
    }

    if (url.pathname === `/2/users/by/username/${username}`) {
      reply(res, 200, { data: { id: USER_ID, username } });
      return;
    }

    if (url.pathname === `/2/users/${USER_ID}/tweets`) {
      const media: Array<Record<string, unknown>> = [];
      const data = tweets.map(tweet => {
        const keys: string[] = [];
        (tweet.media ?? []).forEach((item, index) => {
          const key = `m_${tweet.id}_${index}`;
          keys.push(key);
          media.push({
            media_key: key,
            type: item.type,
            ...(item.url ? { url: item.url } : {}),
            ...(item.preview_image_url ? { preview_image_url: item.preview_image_url } : {}),
          });
        });
        return {
          id: tweet.id,
          text: tweet.text,
          created_at: tweet.created_at,
          ...(keys.length > 0 ? { attachments: { media_keys: keys } } : {}),
        };
      });
      reply(res, 200, { data, ...(media.length > 0 ? { includes: { media } } : {}) });
      return;
    }

    reply(res, 404, { title: 'Not Found' });
  });

  const sockets = new Set<import('node:net').Socket>();
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const port = (server.address() as AddressInfo).port;

  return {
    root: `http://127.0.0.1:${port}`,
    calls,
    setTweets(next) {
      tweets = next;
    },
    setError(status) {
      errorStatus = status;
    },
    close: () =>
      new Promise<void>(resolveClose => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolveClose());
      }),
  };
}
