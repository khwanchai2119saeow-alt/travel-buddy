import type { Metadata, Viewport } from 'next';
import './globals.css';
import BottomNav from '@/components/BottomNav';
import PwaRegister from '@/components/PwaRegister';
import NavHistory from '@/components/NavHistory';
import AutoVisit from '@/components/AutoVisit';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: 'ผู้ช่วยเที่ยว',
  description: 'แผนเที่ยว แผนที่ ค่าใช้จ่าย สแกนใบเสร็จ และแปลภาษา ญี่ปุ่น · จีน ใช้ออฟไลน์ได้',
  appleWebApp: { capable: true, title: 'ผู้ช่วยเที่ยว', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // สีแถบสถานะตามโหมดสว่าง/มืดของ iPhone
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="manifest" href={`${base}/manifest.webmanifest`} />
        <link rel="apple-touch-icon" href={`${base}/icons/apple-touch-icon.png`} />
        <link rel="icon" href={`${base}/icons/icon-192.png`} />
      </head>
      <body>
        <PwaRegister />
        <NavHistory />
        <AutoVisit />
        <main className="mx-auto min-h-screen max-w-xl">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
