import type { Metadata } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const heebo = Heebo({ subsets: ['hebrew'], display: 'swap' });

export const metadata: Metadata = {
  title: 'VentureLab — מעבדת המיזמים',
  description: 'כלי לתכנון מיזם חברתי — מחשבת ישראל שלב ד',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={heebo.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
