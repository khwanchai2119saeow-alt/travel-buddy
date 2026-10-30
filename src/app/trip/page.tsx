'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, saveSettings, type Place } from '@/lib/db';
import { useStats, useTripPlaces } from '@/lib/stats';
import { countryOf } from '@/lib/country';
import { dayLabel, fmtCur, fmtThb0, todayDay } from '@/lib/format';
import { seedSamplePlaces, removeSamplePlaces } from '@/lib/seed';
import { EmptyState, PageHeader, Toggle } from '@/components/ui';
import PlaceModal from '@/components/PlaceModal';
import PlaceForm from '@/components/PlaceForm';
import WeatherCard from '@/components/WeatherCard';
import CsvImport from '@/components/CsvImport';
import type { MapApi } from '@/components/MapView';

// จำว่าเปิดวันไหนไว้ (ต่อทริป) ให้ยังอยู่เมื่อสลับไปแท็บอื่นแล้วกลับมา
const rememberedOpen = new Map<string, Set<number>>();

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-ios-secondary">กำลังโหลดแผนที่…</div>,
});

export default function TripPage() {
  const { stats, settings, daily } = useStats();
  const allPlaces = useTripPlaces(settings.uid) ?? [];

  const [selectedDay, setSelectedDay] = useState<number>(0); // 0 = ทุกวัน
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Place | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<{ lat: number; lng: number; seq: number } | null>(null);
  const [mapMsg, setMapMsg] = useState('');
  const [caching, setCaching] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [gpsMsg, setGpsMsg] = useState('');

  /** เปิดติ๊กอัตโนมัติ: ขอสิทธิ์ตำแหน่งก่อน (iPhone ถามครั้งแรก) */
  function toggleAutoVisit(on: boolean) {
    setGpsMsg('');
    if (!on) return saveSettings({ autoVisit: false });
    if (!navigator.geolocation) return setGpsMsg('เครื่องนี้ใช้ตำแหน่งไม่ได้');
    navigator.geolocation.getCurrentPosition(
      () => saveSettings({ autoVisit: true }),
      (e) =>
        setGpsMsg(
          e.code === 1
            ? 'ไม่ได้รับสิทธิ์ใช้ตำแหน่ง — เปิดได้ที่ แอปตั้งค่าของ iPhone → ความเป็นส่วนตัว → บริการหาตำแหน่ง → เว็บไซต์ Safari → ขณะใช้แอป'
            : 'หาตำแหน่งไม่ได้ตอนนี้ ลองใหม่ในที่โล่ง',
        ),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }
  const mapApi = useRef<MapApi | null>(null);
  const mapWrap = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...allPlaces].sort((a, b) => a.day - b.day || a.order - b.order || a.createdAt - b.createdAt),
    [allPlaces],
  );
  const shown = useMemo(() => (selectedDay === 0 ? sorted : sorted.filter((p) => p.day === selectedDay)), [sorted, selectedDay]);
  const activePlace = activeUid ? sorted.find((p) => p.uid === activeUid) ?? null : null;
  const hasSamples = allPlaces.some((p) => p.sample);

  const spentByPlace = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of daily) if (e.placeUid) m.set(e.placeUid, (m.get(e.placeUid) ?? 0) + e.jpy);
    return m;
  }, [daily]);

  const days = Array.from({ length: settings.days }, (_, i) => i + 1);

  // ย่อ/ขยายรายวัน (มุมมอง "ทุกวัน") — เริ่มต้นเปิดเฉพาะวันนี้ หรือวันแรกที่มีแผน
  const daysWithPlaces = useMemo(() => Array.from(new Set(sorted.map((p) => p.day))), [sorted]);
  const [openDays, setOpenDays] = useState<Set<number> | null>(null);
  const activeOpen = useMemo(() => {
    if (openDays) return openDays;
    const saved = rememberedOpen.get(settings.uid);
    if (saved) return saved;
    const today = todayDay(settings);
    return new Set<number>(daysWithPlaces.includes(today) ? [today] : daysWithPlaces.slice(0, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDays, settings.uid, settings.tripStart, settings.days, daysWithPlaces]);
  function setOpen(next: Set<number>) {
    rememberedOpen.set(settings.uid, next);
    setOpenDays(next);
  }
  function toggleDay(d: number) {
    const next = new Set(activeOpen);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setOpen(next);
  }
  const allOpen = daysWithPlaces.length > 0 && daysWithPlaces.every((d) => activeOpen.has(d));
  useEffect(() => setOpenDays(null), [settings.uid]); // สลับทริป → ใช้ค่าของทริปนั้น
  const countByDay = (d: number) => allPlaces.filter((p) => p.day === d).length;

  function openAdd() {
    setEditing(null);
    setPicked(null);
    setFormOpen(true);
  }
  function openEdit(p: Place) {
    setActiveUid(null);
    setPicked(null);
    setEditing(p);
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    setPicking(false);
  }
  function startPick() {
    setPicking(true);
    mapWrap.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function handleMapClick(lat: number, lng: number) {
    if (!picking) return;
    setPicked({ lat, lng, seq: Date.now() });
    setPicking(false);
  }
  function focusPlace(p: Place) {
    setActiveUid(p.uid);
    mapApi.current?.flyTo(p.lat, p.lng, 15);
  }

  async function toggleVisited(p: Place) {
    if (p.id) await db.places.update(p.id, { visited: !p.visited, visitedAt: p.visited ? undefined : Date.now(), visitedAuto: false });
  }

  async function move(p: Place, dir: -1 | 1) {
    const list = sorted.filter((x) => x.day === p.day);
    const i = list.findIndex((x) => x.uid === p.uid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await db.transaction('rw', db.places, async () => {
      for (let k = 0; k < list.length; k++) {
        const id = list[k].id;
        if (id != null) await db.places.update(id, { order: k });
      }
    });
  }

  async function cacheMap() {
    if (!mapApi.current) return;
    setCaching(true);
    setMapMsg('กำลังเก็บแผนที่ช่วงที่เห็นอยู่ไว้ใช้ออฟไลน์…');
    const n = await mapApi.current.cacheView();
    setMapMsg(n > 0 ? `เก็บแผนที่แล้ว ${n} ชิ้น (ย่านที่เห็นอยู่ตอนนี้)` : 'เก็บไม่ได้ — ต้องมีอินเทอร์เน็ต และต้องติดตั้งแอปแล้ว');
    setCaching(false);
  }

  const dayTotal = selectedDay > 0 ? stats.perDay[selectedDay - 1]?.jpy ?? 0 : 0;

  return (
    <>
      <PageHeader
        title="แผนเที่ยว"
        subtitle={selectedDay ? dayLabel(settings, selectedDay) : 'ทุกวัน'}
        right={
          <button className="btn-primary !py-2" onClick={openAdd}>
            ＋ เพิ่มที่
          </button>
        }
      />

      <div className="hscroll px-4 py-3">
        <button className={selectedDay === 0 ? 'chip-on' : 'chip'} onClick={() => setSelectedDay(0)}>
          ทุกวัน
        </button>
        {days.map((d) => (
          <button key={d} className={selectedDay === d ? 'chip-on' : 'chip'} onClick={() => setSelectedDay(d)}>
            {dayLabel(settings, d)}
            {countByDay(d) > 0 && <span className="ml-1 opacity-70">({countByDay(d)})</span>}
          </button>
        ))}
      </div>

      <div ref={mapWrap} className="relative mx-4 h-[44vh] min-h-[280px] overflow-hidden rounded-2xl ring-1 ring-ios-separator">
        <MapView
          places={shown}
          center={countryOf(settings.country).center}
          showRoute={selectedDay !== 0}
          activeUid={activeUid}
          draft={picked && formOpen ? picked : null}
          picking={picking}
          onSelect={(uid) => setActiveUid(uid)}
          onMapClick={handleMapClick}
          onReady={(api) => (mapApi.current = api)}
        />
        {picking && (
          <div className="absolute inset-x-2 top-2 z-[500] flex items-center justify-between gap-2 rounded-xl bg-ios-blue px-3 py-2 text-sm font-semibold text-white shadow-lg">
            <span>👆 แตะบนแผนที่เพื่อปักหมุด</span>
            <button className="rounded-lg bg-white/20 px-2 py-1" onClick={() => setPicking(false)}>
              ยกเลิก
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <button className="btn-ghost !py-2 text-xs" onClick={cacheMap} disabled={caching}>
          📥 เก็บแผนที่ย่านนี้ไว้ใช้ออฟไลน์
        </button>
        <button className="btn-ghost !py-2 text-xs" onClick={() => setCsvOpen(true)}>
          📄 นำเข้า/ส่งออก CSV
        </button>
        {selectedDay > 0 && (
          <span className="ml-auto text-xs text-ios-secondary">
            ใช้จ่ายวันนี้ {fmtCur(dayTotal)} ≈ {fmtThb0(dayTotal * stats.rate)}
          </span>
        )}
      </div>
      {mapMsg && <p className="px-4 pb-1 text-xs text-ios-secondary">{mapMsg}</p>}

      <div className="mx-4 mb-2 flex items-center gap-3 rounded-widget bg-ios-card px-4 py-3">
        <span className="text-xl">📍</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">ติ๊ก “ไปแล้ว” อัตโนมัติเมื่อถึงที่หมาย</span>
          <span className="block text-[12px] text-ios-secondary">ใช้ GPS ตอนเปิดแอป · อยู่ใกล้หมุด ~150 ม. ราว 1 นาที</span>
        </span>
        <Toggle on={!!settings.autoVisit} onChange={toggleAutoVisit} label="ติ๊กไปแล้วอัตโนมัติ" />
      </div>
      {gpsMsg && <p className="mx-4 mb-2 rounded-xl bg-ios-orange/10 p-3 text-[13px] text-ios-orange">{gpsMsg}</p>}

      {selectedDay > 0 && (
        <div className="px-4 pb-2">
          <WeatherCard settings={settings} places={allPlaces} day={selectedDay} compact />
        </div>
      )}

      <section className="space-y-2 px-4 pb-6">
        {shown.length === 0 && (
          <div className="card">
            <EmptyState text={selectedDay ? 'วันนี้ยังไม่มีแผน กด “＋ เพิ่มที่” ได้เลย' : 'ยังไม่มีสถานที่ในแผน'} />
            {allPlaces.length === 0 && (
              <button className="btn-ghost w-full" onClick={() => seedSamplePlaces(settings.uid, settings.country)}>
                ✨ ใส่สถานที่ตัวอย่าง{settings.country === 'CN' ? 'ปักกิ่ง' : 'ซัปโปโร/โอตารุ'} (ลบได้ทีหลัง)
              </button>
            )}
          </div>
        )}

        {selectedDay === 0 && daysWithPlaces.length > 1 && (
          <div className="flex justify-end">
            <button className="text-[15px] text-ios-blue" onClick={() => setOpen(new Set(allOpen ? [] : daysWithPlaces))}>
              {allOpen ? 'ย่อทั้งหมด' : 'ขยายทั้งหมด'}
            </button>
          </div>
        )}

        {shown.map((p, idx) => {
          const prevDay = idx > 0 ? shown[idx - 1].day : -1;
          const spent = spentByPlace.get(p.uid) ?? 0;
          let spotNo = 0;
          for (const q of shown) {
            if (q.day === p.day && q.kind === 'spot') spotNo++;
            if (q.uid === p.uid) break;
          }
          return (
            <div key={p.uid}>
              {selectedDay === 0 && p.day !== prevDay && (
                <DayHeader
                  label={dayLabel(settings, p.day)}
                  total={shown.filter((x) => x.day === p.day).length}
                  done={shown.filter((x) => x.day === p.day && x.visited).length}
                  open={activeOpen.has(p.day)}
                  onToggle={() => toggleDay(p.day)}
                />
              )}
              {(selectedDay !== 0 || activeOpen.has(p.day)) && (
              <div className={`mt-2 card flex items-start gap-3 !p-3 ${p.uid === activeUid ? 'ring-2 ring-ios-orange' : ''}`}>
                <button
                  onClick={() => focusPlace(p)}
                  className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${
                    p.kind === 'hotel' ? 'bg-ios-indigo' : p.visited ? 'bg-ios-green' : 'bg-ios-blue'
                  }`}
                  aria-label="ดูบนแผนที่"
                >
                  {p.kind === 'hotel' ? '🏨' : p.visited ? '✓' : spotNo}
                </button>
                <button className="min-w-0 flex-1 text-left" onClick={() => focusPlace(p)}>
                  <div className="truncate font-semibold">{p.title}</div>
                  <div className="text-xs text-ios-secondary">
                    {p.time ? `${p.time} น.` : 'ยังไม่กำหนดเวลา'}
                    {p.kind === 'hotel' && p.checkIn ? ` · เช็กอิน ${p.checkIn}` : ''}
                    {p.kind === 'hotel' && p.bookingCode ? ` · รหัส ${p.bookingCode}` : ''}
                    {spent > 0 ? ` · ใช้จ่าย ${fmtCur(spent)}` : ''}
                  </div>
                  {p.note && <div className="mt-0.5 line-clamp-1 text-xs text-ios-secondary">{p.note}</div>}
                </button>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button className={`rounded-lg px-2 py-1 text-xs font-semibold ${p.visited ? 'bg-ios-green/10 text-ios-green' : 'bg-ios-fill text-ios-secondary'}`} onClick={() => toggleVisited(p)}>
                    {p.visited ? 'ไปแล้ว' : 'ยังไม่ไป'}
                  </button>
                  {selectedDay !== 0 && (
                    <div className="flex gap-1">
                      <button className="rounded-lg bg-ios-fill px-2 py-0.5 text-xs" onClick={() => move(p, -1)} aria-label="เลื่อนขึ้น">▲</button>
                      <button className="rounded-lg bg-ios-fill px-2 py-0.5 text-xs" onClick={() => move(p, 1)} aria-label="เลื่อนลง">▼</button>
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
          );
        })}

        {hasSamples && (
          <button className="btn-danger w-full" onClick={() => confirm('ลบสถานที่ตัวอย่างทั้งหมด?') && removeSamplePlaces(settings.uid)}>
            🗑️ ลบสถานที่ตัวอย่างทั้งหมด
          </button>
        )}
      </section>

      {activePlace && (
        <PlaceModal
          place={activePlace}
          spentJpy={spentByPlace.get(activePlace.uid) ?? 0}
          dayText={dayLabel(settings, activePlace.day)}
          onClose={() => setActiveUid(null)}
          onEdit={() => openEdit(activePlace)}
          onToggleVisited={() => toggleVisited(activePlace)}
        />
      )}

      <CsvImport open={csvOpen} onClose={() => setCsvOpen(false)} settings={settings} places={allPlaces} />

      <PlaceForm
        tripUid={settings.uid}
        open={formOpen}
        hidden={picking}
        initial={editing}
        defaultDay={selectedDay || todayDay(settings)}
        days={settings.days}
        tripStart={settings.tripStart}
        picked={picked}
        onRequestPick={startPick}
        onClose={closeForm}
      />
    </>
  );
}

/** หัวข้อของแต่ละวัน แตะเพื่อย่อ/ขยาย */
function DayHeader({ label, total, done, open, onToggle }: { label: string; total: number; done: number; open: boolean; onToggle: () => void }) {
  return (
    <button className="card flex w-full items-center gap-3 !py-3 text-left" onClick={onToggle} aria-expanded={open}>
      <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{label}</span>
      <span className="shrink-0 text-[13px] text-ios-secondary">
        {total} จุด{done > 0 ? ` · ไปแล้ว ${done}` : ''}
      </span>
      <svg viewBox="0 0 12 20" width="9" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 text-ios-tertiary transition-transform ${open ? 'rotate-90' : ''}`}>
        <path d="M2 2l8 8-8 8" />
      </svg>
    </button>
  );
}
