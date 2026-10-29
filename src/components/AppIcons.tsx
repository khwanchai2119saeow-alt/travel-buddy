// ไอคอนทางลัดในหน้าแรกแบบไอคอนแอป iPhone: พื้นไล่สี + สัญลักษณ์สีขาว (วาดเอง ไม่ใช้ไฟล์/ฟอนต์ภายนอก)
import type { ReactNode } from 'react';

type IconName = 'scan' | 'translate' | 'summary' | 'settings';

const GRADIENTS: Record<IconName, [string, string]> = {
  scan: ['#FFB340', '#FF7A00'],
  translate: ['#43A4FF', '#0A64E6'],
  summary: ['#CE72E0', '#8C3BD1'],
  settings: ['#A8A8AD', '#6C6C71'],
};

const GLYPHS: Record<IconName, ReactNode> = {
  // ใบเสร็จในกรอบกล้อง
  scan: (
    <>
      <path
        d="M12 20v-4.5a3.5 3.5 0 0 1 3.5-3.5H20M40 12h4.5a3.5 3.5 0 0 1 3.5 3.5V20M48 40v4.5a3.5 3.5 0 0 1-3.5 3.5H40M20 48h-4.5a3.5 3.5 0 0 1-3.5-3.5V40"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M21 17.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2V42l-3-2-3 2-3-2-3 2-3-2-3 2z" fill="#fff" />
      <rect x="24.5" y="21" width="11" height="2.6" rx="1.3" fill="#FF8A10" />
      <rect x="24.5" y="26.5" width="11" height="2.6" rx="1.3" fill="#FF8A10" opacity="0.55" />
      <rect x="24.5" y="32" width="7" height="2.6" rx="1.3" fill="#FF8A10" opacity="0.55" />
    </>
  ),
  // ฟองคำพูด A กับ 文 (แปลภาษา)
  translate: (
    <>
      <path d="M15 11h17a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5h-9l-6 5v-5h-2a5 5 0 0 1-5-5V16a5 5 0 0 1 5-5z" fill="#fff" />
      <text x="23.5" y="27.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0A64E6" fontFamily="-apple-system, system-ui, sans-serif">
        A
      </text>
      <path
        d="M30 24h15a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5h-1v5l-6-5h-8a5 5 0 0 1-5-5V29a5 5 0 0 1 5-5z"
        fill="#fff"
        stroke="#1A73EE"
        strokeWidth="2.5"
      />
      <text x="37.5" y="40.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0A64E6" fontFamily="'PingFang SC','Hiragino Sans',sans-serif">
        文
      </text>
    </>
  ),
  // เอกสารสรุปพร้อมกราฟแท่ง
  summary: (
    <>
      <rect x="16.5" y="11" width="27" height="38" rx="5" fill="#fff" />
      <rect x="21.5" y="16.5" width="13" height="2.8" rx="1.4" fill="#9A47D6" />
      <rect x="21.5" y="21.5" width="9" height="2.4" rx="1.2" fill="#9A47D6" opacity="0.45" />
      <rect x="21.5" y="33" width="4.5" height="11" rx="1.6" fill="#9A47D6" opacity="0.55" />
      <rect x="27.8" y="28" width="4.5" height="16" rx="1.6" fill="#9A47D6" />
      <rect x="34" y="36.5" width="4.5" height="7.5" rx="1.6" fill="#9A47D6" opacity="0.75" />
    </>
  ),
  // เฟืองแบบแอปตั้งค่า
  settings: (
    <>
      <g fill="#fff">
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x="27" y="9.5" width="6" height="8" rx="1.6" transform={`rotate(${i * 36} 30 30)`} />
        ))}
        <circle cx="30" cy="30" r="15.5" />
      </g>
      <circle cx="30" cy="30" r="10" fill="#8E8E93" />
      <circle cx="30" cy="30" r="6.2" fill="#fff" />
      <circle cx="30" cy="30" r="3" fill="#8E8E93" />
    </>
  ),
};

export default function AppIcon({ name, size = 60 }: { name: IconName; size?: number }) {
  const [from, to] = GRADIENTS[name];
  const id = `appicon-${name}`;
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} aria-hidden className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      {/* มุมโค้งประมาณสัดส่วนไอคอน iOS (~22.4% ของด้าน) */}
      <rect width="60" height="60" rx="13.4" fill={`url(#${id})`} />
      {GLYPHS[name]}
    </svg>
  );
}
