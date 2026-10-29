'use client';
// แถบแท็บลอยแบบกระจกของ iOS — ไอคอนเส้นวาดเอง (ไม่ใช้ไฟล์/ฟอนต์ภายนอก)
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  map: (
    <>
      <path d="M9 5 4 7v12l5-2 6 2 5-2V5l-5 2z" />
      <path d="M9 5v12M15 7v12" />
    </>
  ),
  yen: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.8 7.5 3.2 4.6 3.2-4.6M12 12.1V17M9.2 12.6h5.6M9.2 14.8h5.6" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M8.5 9h7M8.5 12h7M8.5 15h4" />
    </>
  ),
  chat: (
    <>
      <path d="M5 5.5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4.5 3.5v-3.5H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" />
      <path d="M8.5 9.5h4M8.5 12.5h7" />
    </>
  ),
};

const TABS = [
  { href: '/', label: 'วันนี้', icon: 'home' },
  { href: '/trip/', label: 'แผนเที่ยว', icon: 'map' },
  { href: '/expenses/', label: 'ค่าใช้จ่าย', icon: 'yen' },
  { href: '/scan/', label: 'สแกน', icon: 'scan' },
  { href: '/translate/', label: 'แปล', icon: 'chat' },
];

export default function BottomNav() {
  const path = usePathname() || '/';
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/$/, '') : p);
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
      <ul className="glass pointer-events-auto mx-auto flex max-w-md rounded-full p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-[0.5px] ring-ios-separator">
        {TABS.map((t) => {
          const active = norm(path) === norm(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-semibold transition ${
                  active ? 'bg-ios-fill text-ios-blue' : 'text-ios-label/80'
                }`}
              >
                <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {ICONS[t.icon]}
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
