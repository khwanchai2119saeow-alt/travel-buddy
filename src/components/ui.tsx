'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PAGE_TITLES, previousPath } from './NavHistory';

/** ปุ่มย้อนกลับแบบ iPhone: "‹ ชื่อหน้าก่อนหน้า" — ถ้าเปิดหน้านี้ตรง ๆ (ไม่มีหน้าก่อนในแอป) จะไปหน้า fallback แทน */
function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  const [prev, setPrev] = useState<string | null>(null);
  useEffect(() => setPrev(previousPath()), []);
  const label = PAGE_TITLES[prev ?? fallback] ?? 'ย้อนกลับ';
  return (
    <button
      className="-ml-2 flex min-w-0 items-center gap-0.5 py-1 pr-2 text-[17px] text-ios-blue active:opacity-50"
      onClick={() => (prev ? router.back() : router.push(fallback))}
      aria-label={`ย้อนกลับไป${label}`}
    >
      <svg viewBox="0 0 12 20" width="12" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
        <path d="M10 2 2 10l8 8" />
      </svg>
      <span className="truncate">{label}</span>
    </button>
  );
}

/** หัวหน้าแบบ iOS: ชื่อหัวข้อตัวใหญ่ + แถบกระจกด้านบนที่โผล่ชื่อเล็กเมื่อเลื่อนลง · back = หน้าที่จะกลับไปถ้าไม่มีประวัติ */
export function PageHeader({ title, subtitle, right, back }: { title: string; subtitle?: string; right?: React.ReactNode; back?: string }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 44);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <>
      <div
        className={`sticky top-0 z-30 transition-colors ${scrolled ? 'glass border-b-[0.5px] border-ios-separator' : 'bg-transparent'}`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* 3 ช่องแบบ iOS: ย้อนกลับ | ชื่อหน้า (กลาง) | ปุ่มขวา */}
        <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4">
          <div className="flex min-w-0 justify-start">{back && <BackButton fallback={back} />}</div>
          <span className={`max-w-[50vw] truncate text-[17px] font-semibold transition-opacity ${scrolled ? 'opacity-100' : 'opacity-0'}`}>{title}</span>
          <div className="flex min-w-0 justify-end">{right}</div>
        </div>
      </div>
      <header className="px-4 pb-2">
        <h1 className="truncate pt-1 text-[34px] font-bold leading-[1.3] tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-[15px] text-ios-secondary">{subtitle}</p>}
      </header>
    </>
  );
}

/** หน้าต่างแบบ sheet ของ iOS (เลื่อนขึ้นจากด้านล่าง มีแถบจับด้านบน) */
export function Modal({
  open,
  onClose,
  children,
  hidden,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  hidden?: boolean;
  title?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 ${hidden ? 'hidden' : ''}`}
      onClick={onClose}
    >
      <div
        className="sheet-in max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] bg-ios-bg px-4 pt-2 shadow-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-[5px] w-9 rounded-full bg-ios-tertiary" />
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center">
          <span />
          <h2 className="truncate text-center text-[17px] font-semibold">{title}</h2>
          <button className="justify-self-end text-[17px] font-semibold text-ios-blue" onClick={onClose} aria-label="ปิด">
            เสร็จ
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'rose' | 'sky' | 'emerald' }) {
  const color = tone === 'rose' ? 'text-ios-red' : tone === 'sky' ? 'text-ios-blue' : tone === 'emerald' ? 'text-ios-green' : 'text-ios-label';
  return (
    <div className="card !p-3.5">
      <div className="text-[13px] text-ios-secondary">{label}</div>
      <div className={`text-[22px] font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-xs text-ios-secondary">{sub}</div>}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-ios-secondary">{text}</p>;
}

/** สร้าง/คืน object URL ของ Blob ให้อัตโนมัติ */
export function useBlobUrl(blob?: Blob): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** แสดงรูปจาก Blob */
export function BlobImg({ blob, alt, className }: { blob?: Blob; alt: string; className?: string }) {
  const url = useBlobUrl(blob);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}

/** สวิตช์เปิด/ปิดแบบ iOS */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-ios-green' : 'bg-ios-fill'}`}
    >
      <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15)] transition-all ${on ? 'left-[22px]' : 'left-[2px]'}`} />
    </button>
  );
}
