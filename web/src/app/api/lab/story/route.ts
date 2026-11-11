import { NextResponse } from 'next/server';
import { getStoryFeed } from '../../../../server/story-feed.ts';

export const dynamic = 'force-dynamic';

/** 公开的 X / Telegram 指标与最新帖；服务端缓存由 story-feed 负责。 */
export async function GET() {
  const feed = await getStoryFeed();
  return NextResponse.json(feed, { headers: { 'Cache-Control': 'no-store' } });
}
