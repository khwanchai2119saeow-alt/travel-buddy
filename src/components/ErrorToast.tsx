'use client';
// แจ้งเตือนเมื่อบันทึก/ทำงานเบื้องหลังไม่สำเร็จ (เช่นพื้นที่ในเครื่องเต็ม) แทนที่จะเงียบไปเฉย ๆ
import { useEffect, useState } from 'react';

function messageOf(reason: unknown): string | null {
  const e = reason as { name?: string; message?: string; inner?: { name?: string } } | undefined;
  const name = e?.name ?? '';
  const inner = e?.inner?.name ?? '';
  const text = `${name} ${inner} ${e?.message ?? ''}`;
  if (/AbortError/.test(name)) return null; // ผู้ใช้ยกเลิกเอง (เช่นปิดเมนูแชร์)
  if (/ResizeObserver/.test(text)) return null; // ไม่มีผลกับการใช้งาน
  if (/QuotaExceeded/i.test(text)) return 'พื้นที่เก็บข้อมูลในเครื่องเต็ม — บันทึกไม่สำเร็จ ลองลบรูปที่ไม่ใช้ หรือสำรองแล้วลบทริปเก่า';
  if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text)) {
    return 'โหลดส่วนของแอปไม่สำเร็จ (อาจเพิ่งอัปเดตหรือเน็ตหลุด) — แตะ “โหลดใหม่”';
  }
  if (/DatabaseClosed|InvalidState|UnknownError|OpenFailed|VersionError/i.test(text)) {
    return 'ฐานข้อมูลในเครื่องสะดุด — แตะ “โหลดใหม่” (ข้อมูลไม่หาย)';
  }
  return 'มีบางอย่างไม่สำเร็จ ลองอีกครั้ง' + (e?.message ? ` (${e.message.slice(0, 80)})` : '');
}

export default function ErrorToast() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const show = (reason: unknown) => {
      const m = messageOf(reason);
      if (m) setMsg(m);
    };
    const onRejection = (e: PromiseRejectionEvent) => show(e.reason);
    const onError = (e: ErrorEvent) => {
      if (e.error || e.message) show(e.error ?? { message: e.message });
    };
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 9000);
    return () => clearTimeout(t);
  }, [msg]);

  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[1200] flex justify-center px-4" style={{ top: 'calc(env(safe-area-inset-top) + 8px)' }}>
      <div className="glass sheet-in pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 shadow-lg ring-[0.5px] ring-ios-separator" role="alert">
        <span className="text-xl">⚠️</span>
        <span className="min-w-0 flex-1 text-[14px]">{msg}</span>
        <button className="shrink-0 text-[15px] font-semibold text-ios-blue" onClick={() => window.location.reload()}>
          โหลดใหม่
        </button>
        <button className="shrink-0 text-[15px] text-ios-secondary" onClick={() => setMsg(null)} aria-label="ปิด">
          ✕
        </button>
      </div>
    </div>
  );
}
