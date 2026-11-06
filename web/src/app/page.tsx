import type { Metadata } from 'next';
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
export default async function Page() {
  return <PublicApp />;
}
