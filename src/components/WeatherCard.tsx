'use client';
// การ์ดพยากรณ์อากาศของ "วันที่ N" ในทริป (Open-Meteo ฟรี) — ใช้แคชในเครื่องตอนออฟไลน์
import Link from 'next/link';
import type { Place, Settings } from '@/lib/db';
import { describe, tips, useDayWeather } from '@/lib/weather';

function ago(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  return `${Math.round(h / 24)} วันที่แล้ว`;
}

export default function WeatherCard({ settings, places, day, compact }: { settings: Settings; places: Place[]; day: number; compact?: boolean }) {
  const { loc, weather, status, fetchedAt, busy, error, reload } = useDayWeather(settings, places, day);

  if (status === 'no-date') {
    return (
      <div className={compact ? 'rounded-widget bg-ios-card p-3.5 text-[13px] text-ios-secondary' : 'card text-sm text-ios-secondary'}>
        🌤️ ตั้ง <Link href="/settings/" className="font-bold underline">วันเริ่มเดินทาง</Link> ก่อน แล้วจะเห็นพยากรณ์อากาศรายวัน
      </div>
    );
  }

  const box = compact ? 'rounded-widget bg-ios-card p-3.5' : 'card';

  if (!weather) {
    const text =
      status === 'loading'
        ? 'กำลังโหลดพยากรณ์อากาศ…'
        : status === 'not-yet'
          ? 'ยังไกลเกินไป — พยากรณ์จะมีให้ดูเมื่อเหลือไม่เกิน 16 วันก่อนถึงวันนั้น'
          : status === 'past'
            ? 'วันนั้นผ่านไปแล้ว ไม่มีพยากรณ์ย้อนหลัง'
            : 'ยังไม่มีข้อมูลอากาศ — ต้องต่ออินเทอร์เน็ตครั้งแรกเพื่อโหลด แล้วจะดูออฟไลน์ได้';
    return (
      <div className={`${box} text-xs text-ios-secondary`}>
        🌤️ {text}
        <div className="mt-0.5 truncate text-[11px] text-ios-secondary">📍 {loc.name}</div>
      </div>
    );
  }

  const d = describe(weather.code);
  const advice = tips(weather);
  return (
    <div className={box}>
      <div className="flex items-center gap-3">
        <div className="text-4xl leading-none">{d.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{d.th}</div>
          <div className="truncate text-[11px] text-ios-secondary">📍 {loc.name}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold leading-tight">
            {Math.round(weather.tMax)}° <span className="text-sm font-semibold text-ios-secondary">/ {Math.round(weather.tMin)}°</span>
          </div>
          <div className="text-[11px] text-ios-secondary">สูงสุด / ต่ำสุด</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ios-secondary">
        {weather.pop != null && <span>☔ โอกาสฝน/หิมะ {weather.pop}%</span>}
        {weather.snow > 0 && <span>❄️ หิมะ {weather.snow.toFixed(1)} ซม.</span>}
        <span>💨 ลม {Math.round(weather.wind)} กม./ชม.</span>
      </div>
      {advice.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[13px] text-ios-orange">
          {advice.map((t) => (
            <li key={t}>• {t}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between text-[11px] text-ios-secondary">
        <span>
          Open-Meteo · อัปเดต {ago(fetchedAt)}
          {error ? ' · ตอนนี้อัปเดตไม่ได้ (ใช้ข้อมูลเดิม)' : ''}
        </span>
        <button className="text-ios-blue" onClick={reload} disabled={busy}>
          {busy ? 'กำลังโหลด…' : 'โหลดใหม่'}
        </button>
      </div>
    </div>
  );
}

/** สีพื้นวิดเจ็ตตามสภาพอากาศ (โทนเดียวกับวิดเจ็ตสภาพอากาศของ iPhone) */
function sky(code: number | undefined): string {
  if (code === undefined) return 'linear-gradient(160deg,#5b8fd6,#2f5fae)';
  if (code <= 1) return 'linear-gradient(160deg,#4a9bf0,#1d63d1)';
  if (code <= 3 || code === 45 || code === 48) return 'linear-gradient(160deg,#7b8fa8,#4b5d76)';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'linear-gradient(160deg,#9db3cf,#5d7699)';
  return 'linear-gradient(160deg,#647789,#37465a)';
}

/** วิดเจ็ตสี่เหลี่ยมเล็กสำหรับหน้าแรก */
export function WeatherWidget({ settings, places, day }: { settings: Settings; places: Place[]; day: number }) {
  const { loc, weather, status } = useDayWeather(settings, places, day);
  const d = weather ? describe(weather.code) : null;
  const note =
    status === 'no-date'
      ? 'ตั้งวันเริ่มเดินทางก่อน'
      : status === 'loading'
        ? 'กำลังโหลด…'
        : status === 'not-yet'
          ? 'มีให้ดูเมื่อเหลือ ≤ 16 วัน'
          : status === 'past'
            ? 'ไม่มีข้อมูลย้อนหลัง'
            : 'ต่อเน็ตเพื่อโหลดครั้งแรก';
  return (
    <Link
      href={status === 'no-date' ? '/settings/' : '/trip/'}
      className="flex aspect-square flex-col justify-between rounded-widget p-3.5 text-white shadow-sm"
      style={{ background: sky(weather?.code) }}
    >
      <div>
        <div className="truncate text-[13px] font-semibold">📍 {loc.name}</div>
        {weather ? (
          <div className="text-[40px] font-light leading-none tracking-tight">{Math.round(weather.tMax)}°</div>
        ) : (
          <div className="mt-1 text-3xl">🌤️</div>
        )}
      </div>
      {weather && d ? (
        <div>
          <div className="text-xl leading-none">{d.emoji}</div>
          <div className="mt-1 truncate text-[13px] font-semibold">{d.th}</div>
          <div className="text-[12px] opacity-90">
            สูง {Math.round(weather.tMax)}° ต่ำ {Math.round(weather.tMin)}°{weather.snow > 0 ? ` · ❄️${weather.snow.toFixed(0)}ซม.` : ''}
          </div>
        </div>
      ) : (
        <div className="text-[13px] opacity-90">{note}</div>
      )}
    </Link>
  );
}
