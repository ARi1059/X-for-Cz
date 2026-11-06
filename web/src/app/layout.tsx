import type { ReactNode } from 'react';
import './globals.css';
import './public-tokens.css';
import '../components/noir-motion.css';
import './noir-public.css';

export const dynamic = 'force-dynamic';
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
