'use client';
import { useEffect, useState } from 'react';
import { BASE } from '@/lib/base';
import { ensureActiveTrip, requestPersistentStorage } from '@/lib/db';

const CHECK_EVERY = 60 * 60 * 1000; // เช็กเวอร์ชันใหม่ไม่เกินชั่วโมงละครั้ง (ตอนกลับมาเปิดแอป)

/** ลงทะเบียน Service Worker (เฉพาะตอน build จริง) ขอให้เบราว์เซอร์เก็บข้อมูลถาวร และเตรียมทริปแรก
 *  แอปเปิดจากแคชทันที → ถ้ามีเวอร์ชันใหม่ติดตั้งเสร็จเบื้องหลัง จะขึ้นแถบให้แตะโหลดใหม่ */
export default function PwaRegister() {
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    requestPersistentStorage();
    ensureActiveTrip().catch(() => {}); // เครื่องใหม่ยังไม่มีทริป → สร้างให้ 1 ทริป
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;

    const sw = navigator.serviceWorker;
    const hadController = !!sw.controller; // ครั้งแรกที่ติดตั้ง ไม่ต้องบอกว่ามีเวอร์ชันใหม่
    const onChange = () => hadController && setUpdated(true);
    sw.addEventListener('controllerchange', onChange);

    let reg: ServiceWorkerRegistration | undefined;
    let lastCheck = Date.now();
    sw.register(`${BASE}/sw.js`, { scope: `${BASE}/` })
      .then((r) => (reg = r))
      .catch((err) => console.warn('ลงทะเบียน Service Worker ไม่สำเร็จ', err));
    // iPhone มักพักแอปไว้แทนการปิด → เช็กเวอร์ชันใหม่ตอนกลับมาเปิด
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !reg || Date.now() - lastCheck < CHECK_EVERY) return;
      lastCheck = Date.now();
      reg.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      sw.removeEventListener('controllerchange', onChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!updated) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[45] flex justify-center px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}>
      <button
        className="glass pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 text-[14px] shadow-lg ring-[0.5px] ring-ios-separator"
        onClick={() => window.location.reload()}
      >
        <span>✨ มีแอปเวอร์ชันใหม่</span>
        <span className="font-semibold text-ios-blue">แตะเพื่อโหลดใหม่</span>
      </button>
    </div>
  );
}
