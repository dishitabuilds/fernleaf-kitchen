import type { Metadata } from 'next';
import { SessionProvider } from '@/features/auth/session-provider';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Fernleaf Kitchen', template: '%s · Fernleaf Kitchen' },
  description: 'Company meal operations for Fernleaf Kitchen staff.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><SessionProvider>{children}</SessionProvider></body></html>;
}
