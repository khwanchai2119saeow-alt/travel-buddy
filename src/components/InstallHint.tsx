'use client';
import { useEffect, useState } from 'react';

/** วิธีเพิ่มแอปลงหน้าจอโฮมของ iPhone (ซ่อนเมื่อเปิดจากหน้าจอโฮมแล้ว) */
export default function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
    setShow(!standalone);
  }, []);

  if (!show) return null;
  return (
    <div className="card flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ios-blue text-white">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M8 7l4-4 4 4" />
          <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
        </svg>
      </span>
      <div className="text-[15px]">
        <div className="font-semibold">เพิ่มลงหน้าจอโฮม</div>
        <div className="text-ios-secondary">
          ใน Safari แตะปุ่มแชร์ แล้วเลือก “เพิ่มไปยังหน้าจอโฮม” ข้อมูลจะไม่ถูกระบบล้าง และเปิดใช้ออฟไลน์ได้
        </div>
      </div>
    </div>
  );
}
