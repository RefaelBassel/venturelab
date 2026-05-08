import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { InstallPrompt } from './InstallPrompt';

const heebo = Heebo({ subsets: ['hebrew'], display: 'swap' });

export const metadata: Metadata = {
  title: 'VentureLab — מעבדת המיזמים',
  description: 'כלי לתכנון מיזם חברתי — מחשבת ישראל שלב ד',
  manifest: '/manifest.webmanifest',
  applicationName: 'VentureLab',
  appleWebApp: {
    capable: true,
    title: 'VentureLab',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#6366f1',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={heebo.className}>
        <Providers>
          {children}
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
