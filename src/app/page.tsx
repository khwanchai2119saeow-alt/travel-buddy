'use client';
// หน้าแรกแบบวิดเจ็ตของ iPhone: อากาศ · ใช้จ่ายวันนี้ · เงินทั้งทริป · แผนวันนี้ · ทางลัด
import Link from 'next/link';
import { useStats, useTripPlaces } from '@/lib/stats';
import { dayLabel, fmtCur, fmtThb0, inTripNow, todayDay, tripRangeText } from '@/lib/format';
import { PageHeader } from '@/components/ui';
import PriceCalc from '@/components/PriceCalc';
import InstallHint from '@/components/InstallHint';
import { WeatherWidget } from '@/components/WeatherCard';
import AppIcon from '@/components/AppIcons';
import { countryOf } from '@/lib/country';

function tripStatus(tripStart: string, days: number): string {
  if (!tripStart) return 'ตั้งวันเดินทางได้ในการตั้งค่า';
  const start = new Date(tripStart + 'T00:00:00');
  if (isNaN(start.getTime())) return '';
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((start.getTime() - now.getTime()) / 86400000);
  if (diff > 0) return `อีก ${diff} วันออกเดินทาง ✈️`;
  const dayNo = -diff + 1;
  if (dayNo <= days) return `วันที่ ${dayNo} จาก ${days} ของทริป`;
  return 'ทริปนี้จบแล้ว ไปดูสรุปทริปได้เลย';
}

const SHORTCUTS = [
  { href: '/scan/', label: 'สแกนใบเสร็จ', icon: 'scan' },
  { href: '/translate/', label: 'แปลภาษา', icon: 'translate' },
  { href: '/summary/', label: 'สรุปทริป', icon: 'summary' },
  { href: '/settings/', label: 'ตั้งค่า', icon: 'settings' },
] as const;

export default function HomePage() {
  const { stats, settings } = useStats();
  const places = useTripPlaces(settings.uid);
  const today = todayDay(settings);
  const todayStat = stats.perDay[today - 1];
  const todayPlaces = (places ?? []).filter((p) => p.day === today).sort((a, b) => a.order - b.order);
  const live = inTripNow(settings);
  const C = countryOf(settings.country);
  const used = stats.exchangedJpy > 0 ? Math.min(1, Math.max(0, stats.tripTotalJpy / stats.exchangedJpy)) : 0;

  return (
    <>
      <PageHeader
        title={`สวัสดี ${C.name}`}
        subtitle={`${settings.members.find((m) => m.id === settings.me)?.name ?? settings.nameA} · ${tripStatus(settings.tripStart, settings.days)}`}
        right={
          <Link href="/settings/" className="grid h-8 w-8 place-items-center rounded-full bg-ios-fill text-ios-blue" aria-label="ตั้งค่า">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        }
      />

      <Link href="/trips/" className="mx-4 mb-3 flex items-center gap-3 rounded-widget bg-ios-card px-4 py-3">
        <span className="text-3xl leading-none">{C.flag}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold">{settings.name}</span>
          <span className="block truncate text-[13px] text-ios-secondary">{tripRangeText(settings)}</span>
        </span>
        <span className="shrink-0 text-[15px] text-ios-blue">ทริปทั้งหมด ›</span>
      </Link>

      <section className="grid grid-cols-2 gap-3 px-4 pt-1">
        {/* วิดเจ็ตเล็ก: อากาศ */}
        {places ? <WeatherWidget settings={settings} places={places} day={today} /> : <div className="aspect-square rounded-widget bg-ios-card" />}

        {/* วิดเจ็ตเล็ก: ใช้จ่ายวันนี้ */}
        <Link href="/expenses/" className="card flex aspect-square flex-col justify-between !p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ios-red">{live ? 'ใช้วันนี้' : dayLabel(settings, today)}</span>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-ios-red text-[15px] font-bold text-white">{C.badge}</span>
          </div>
          <div>
            <div className="text-[30px] font-bold leading-none tracking-tight tabular-nums">{fmtCur(todayStat?.jpy ?? 0)}</div>
            <div className="mt-1 text-[13px] text-ios-secondary">≈ {fmtThb0((todayStat?.jpy ?? 0) * stats.rate)}</div>
          </div>
          <div className="text-[13px] font-semibold text-ios-blue">＋ จดรายจ่าย</div>
        </Link>

        {/* วิดเจ็ตกลาง: เงินทั้งทริป */}
        <Link href="/expenses/" className="card col-span-2 !p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-ios-secondary">รวมทั้งทริป</span>
            <span className="text-[13px] text-ios-secondary">{fmtCur(C.rateUnit)} = ฿{(stats.rate * C.rateUnit).toFixed(2)}</span>
          </div>
          <div className="text-[34px] font-bold leading-tight tracking-tight tabular-nums">{fmtThb0(stats.grandThb)}</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[13px]">
            <div>
              <div className="text-ios-secondary">ล่วงหน้า</div>
              <div className="font-semibold tabular-nums">{fmtThb0(stats.preTotalThb)}</div>
            </div>
            <div>
              <div className="text-ios-secondary">ที่{C.name}</div>
              <div className="font-semibold tabular-nums">{fmtCur(stats.tripTotalJpy)}</div>
            </div>
            <div>
              <div className="text-ios-secondary">{C.curName}เหลือ</div>
              <div className={`font-semibold tabular-nums ${stats.walletLeftJpy < 0 ? 'text-ios-red' : 'text-ios-green'}`}>
                {stats.exchangedJpy > 0 ? fmtCur(stats.walletLeftJpy) : '—'}
              </div>
            </div>
          </div>
          {stats.exchangedJpy > 0 && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ios-fill">
              <div className="h-full rounded-full bg-ios-green" style={{ width: `${(1 - used) * 100}%` }} />
            </div>
          )}
        </Link>

        {/* วิดเจ็ตกลาง: แผนวันนี้ */}
        <Link href="/trip/" className="card col-span-2 !p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-ios-indigo">{live ? 'แผนวันนี้' : `แผน${dayLabel(settings, today)}`}</span>
            <span className="text-[13px] text-ios-secondary">{todayPlaces.length} จุด</span>
          </div>
          {todayPlaces.length === 0 ? (
            <p className="mt-1 text-[15px] text-ios-secondary">ยังไม่มีแผน แตะเพื่อเพิ่มสถานที่</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {todayPlaces.slice(0, 3).map((p) => (
                <li key={p.uid} className="flex items-center gap-2 text-[15px]">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${p.kind === 'hotel' ? 'bg-ios-indigo' : p.visited ? 'bg-ios-green' : 'bg-ios-red'}`} />
                  <span className="w-12 shrink-0 tabular-nums text-ios-secondary">{p.time || '—'}</span>
                  <span className={`truncate ${p.visited ? 'text-ios-secondary line-through' : ''}`}>{p.title}</span>
                </li>
              ))}
              {todayPlaces.length > 3 && <li className="text-[13px] text-ios-secondary">และอีก {todayPlaces.length - 3} จุด</li>}
            </ul>
          )}
        </Link>

        {/* ทางลัดแบบไอคอนแอป */}
        <div className="col-span-2 grid grid-cols-4 gap-3 py-1">
          {SHORTCUTS.map((s) => (
            <Link key={s.href} href={s.href} className="flex flex-col items-center gap-1.5 active:opacity-70">
              <AppIcon name={s.icon} />
              <span className="text-center text-[12px] leading-tight">{s.label}</span>
            </Link>
          ))}
        </div>

        <div className="col-span-2">
          <PriceCalc rate={stats.rate} />
        </div>

        <div className="col-span-2">
          <InstallHint />
        </div>
      </section>

      <div className="section-title">ฉุกเฉินใน{C.name}</div>
      <div className="ios-list mx-4">
        {C.emergency.map((e) => (
          <a key={e.num} href={`tel:${e.num}`} className="ios-row">
            <span className={`grid h-8 w-8 place-items-center rounded-lg text-white ${e.num === '110' ? 'bg-ios-blue' : 'bg-ios-red'}`}>{e.emoji}</span>
            <span className="flex-1">{e.label}</span>
            <span className="font-semibold text-ios-blue">{e.num}</span>
          </a>
        ))}
      </div>
      {settings.notes ? (
        <>
          <div className="section-title">ข้อมูลสำคัญของฉัน</div>
          <div className="card mx-4 whitespace-pre-wrap text-[15px]">{settings.notes}</div>
        </>
      ) : (
        <p className="px-8 pt-2 text-[13px] text-ios-secondary">เก็บเลขกรมธรรม์ เบอร์สถานทูต ฯลฯ ได้ที่ ตั้งค่า → ข้อมูลสำคัญ</p>
      )}

      <p className="px-4 pb-2 pt-6 text-center text-[13px] text-ios-secondary">ข้อมูลทั้งหมดเก็บใน iPhone เครื่องนี้ · ไม่ต้องล็อกอิน · ฟรี 100%</p>
    </>
  );
}
