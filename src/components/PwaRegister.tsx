'use client';
import { useEffect } from 'react';
import { BASE } from '@/lib/base';
import { ensureActiveTrip, requestPersistentStorage } from '@/lib/db';

/** ลงทะเบียน Service Worker (เฉพาะตอน build จริง) ขอให้เบราว์เซอร์เก็บข้อมูลถาวร และเตรียมทริปแรก */
export default function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register(`${BASE}/sw.js`, { scope: `${BASE}/` })
        .catch((err) => console.warn('ลงทะเบียน Service Worker ไม่สำเร็จ', err));
    }
    requestPersistentStorage();
    ensureActiveTrip(); // เครื่องใหม่ยังไม่มีทริป → สร้างให้ 1 ทริป
  }, []);
  return null;
}
