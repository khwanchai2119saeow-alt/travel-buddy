'use client';
// ติ๊ก "ไปแล้ว" อัตโนมัติเมื่อถึงหมุด — ใช้ GPS เฉพาะตอนเปิดแอปอยู่บนจอ (iPhone ไม่ให้เว็บแอปตามตำแหน่งเบื้องหลัง)
// เงื่อนไข: อยู่ในรัศมี RADIUS เมตรของสถานที่ที่ยังไม่ไป ต่อเนื่องอย่างน้อย DWELL_MS (กันกรณีแค่นั่งรถผ่าน)
import { useEffect, useRef, useState } from 'react';
import { db, type Place } from '@/lib/db';
import { distanceMeters } from '@/lib/geo';
import { useSettings } from '@/lib/stats';

const RADIUS = 150; // เมตร
const MAX_ACCURACY = 150; // GPS คลาดเคลื่อนเกินนี้ไม่นับ
const DWELL_MS = 60_000; // ต้องอยู่ใกล้ ๆ อย่างน้อย 1 นาที

export default function AutoVisit() {
  const s = useSettings();
  const enabled = !!s.autoVisit && !!s.uid;
  const [toast, setToast] = useState<Place | null>(null);
  const firstSeen = useRef(new Map<string, number>()); // uid → เวลาที่เข้ามาในรัศมีครั้งแรก
  const tripUid = useRef(s.uid);
  tripUid.current = s.uid;

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.geolocation) return;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let last: GeolocationPosition | null = null;

    async function onPosition(pos: GeolocationPosition) {
      last = pos;
      if (pos.coords.accuracy > MAX_ACCURACY) return;
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const candidates = await db.places
        .where('tripUid')
        .equals(tripUid.current)
        .filter((p) => !p.visited && p.kind === 'spot')
        .toArray();
      const now = Date.now();
      const near = new Set<string>();
      for (const p of candidates) {
        if (distanceMeters(here, p) > RADIUS) continue;
        near.add(p.uid);
        const since = firstSeen.current.get(p.uid);
        if (since == null) {
          firstSeen.current.set(p.uid, now);
        } else if (now - since >= DWELL_MS && p.id != null) {
          await db.places.update(p.id, { visited: true, visitedAt: now, visitedAuto: true });
          firstSeen.current.delete(p.uid);
          setToast(p);
        }
      }
      // ออกจากรัศมีแล้ว → เริ่มนับใหม่
      for (const uid of [...firstSeen.current.keys()]) if (!near.has(uid)) firstSeen.current.delete(uid);
    }

    const start = () => {
      if (watchId != null || document.visibilityState !== 'visible') return;
      watchId = navigator.geolocation.watchPosition(onPosition, () => {}, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 });
      // ยืนนิ่ง ๆ เครื่องอาจไม่ส่งตำแหน่งใหม่ → ตรวจซ้ำด้วยตำแหน่งล่าสุดทุก 15 วินาที ให้ครบ 1 นาทีได้
      timer = setInterval(() => {
        if (last && Date.now() - last.timestamp < 120_000) onPosition(last);
      }, 15_000);
    };
    const stop = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      if (timer) clearInterval(timer);
      watchId = null;
      timer = null;
    };
    const onVis = () => (document.visibilityState === 'visible' ? start() : stop());

    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  async function undo() {
    if (toast?.id != null) await db.places.update(toast.id, { visited: false, visitedAt: undefined, visitedAuto: false });
    setToast(null);
  }

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[1100] flex justify-center px-4" style={{ top: 'calc(env(safe-area-inset-top) + 8px)' }}>
      <div className="glass sheet-in pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 shadow-lg ring-[0.5px] ring-ios-separator" role="status">
        <span className="text-xl">✅</span>
        <span className="min-w-0 flex-1 text-[15px]">
          <span className="block truncate font-semibold">ถึง {toast.title} แล้ว</span>
          <span className="block text-[12px] text-ios-secondary">ติ๊ก “ไปแล้ว” ให้อัตโนมัติ</span>
        </span>
        <button className="shrink-0 text-[15px] font-semibold text-ios-blue" onClick={undo}>
          เลิกทำ
        </button>
      </div>
    </div>
  );
}
