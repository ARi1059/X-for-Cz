import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { PublicApp } from '../components/public-app';
import { getRuntime } from '../server/runtime';
import { readPublicVersion } from '../server/publication';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const { config, versionId } = readPublicVersion(getRuntime());
  return {
    title: config.meta.title,
    description: config.meta.description,
    robots: { index: false, follow: false },
    openGraph: {
      title: config.meta.title,
      description: config.meta.description,
      ...(config.meta.shareMediaId ? { images: [`${getRuntime().origin}/share/${config.meta.shareMediaId}?version=${versionId}`] } : {}),
    },
  };
}
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const host = (await headers()).get('host') ?? '';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return <PublicApp lightGallery={process.env.NODE_ENV === 'development' && local && params.experience === 'light-gallery'} lusionLab={process.env.NODE_ENV === 'development' && local && params.experience === 'lusion'} />;
}
