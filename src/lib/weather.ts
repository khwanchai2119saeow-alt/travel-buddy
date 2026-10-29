'use client';
// พยากรณ์อากาศรายวันจาก Open-Meteo (ฟรี ไม่ต้องสมัคร ไม่ต้องใช้ key)
// โหลดเฉพาะตอนเปิดหน้าที่ใช้และมีเน็ต แล้วเก็บลง IndexedDB ไว้ดูตอนออฟไลน์
// Open-Meteo พยากรณ์ล่วงหน้าได้ไม่เกิน 16 วัน วันที่ไกลกว่านั้นจะยังไม่มีข้อมูล
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Place, type Settings, type WeatherCache, type WeatherDay } from './db';
import { countryOf, type Country } from './country';
import { dayDate, ymd } from './format';

const STALE_MS = 3 * 60 * 60 * 1000; // อัปเดตใหม่ถ้าเก่ากว่า 3 ชั่วโมง

export const locKey = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

/** สภาพอากาศตามรหัส WMO → ข้อความไทย + อีโมจิ */
export function describe(code: number): { th: string; emoji: string } {
  if (code === 0) return { th: 'ท้องฟ้าแจ่มใส', emoji: '☀️' };
  if (code === 1) return { th: 'ส่วนใหญ่แจ่มใส', emoji: '🌤️' };
  if (code === 2) return { th: 'มีเมฆบางส่วน', emoji: '⛅' };
  if (code === 3) return { th: 'เมฆมาก', emoji: '☁️' };
  if (code === 45 || code === 48) return { th: 'มีหมอก', emoji: '🌫️' };
  if (code >= 51 && code <= 55) return { th: 'ฝนปรอย', emoji: '🌦️' };
  if (code === 56 || code === 57 || code === 66 || code === 67) return { th: 'ฝนเยือกแข็ง (ถนนลื่นมาก)', emoji: '🧊' };
  if (code === 61) return { th: 'ฝนตกเล็กน้อย', emoji: '🌧️' };
  if (code === 63) return { th: 'ฝนตกปานกลาง', emoji: '🌧️' };
  if (code === 65) return { th: 'ฝนตกหนัก', emoji: '🌧️' };
  if (code === 71) return { th: 'หิมะตกเล็กน้อย', emoji: '🌨️' };
  if (code === 73) return { th: 'หิมะตกปานกลาง', emoji: '🌨️' };
  if (code === 75) return { th: 'หิมะตกหนัก', emoji: '❄️' };
  if (code === 77) return { th: 'เกล็ดหิมะ', emoji: '❄️' };
  if (code >= 80 && code <= 82) return { th: 'ฝนตกเป็นช่วง ๆ', emoji: '🌦️' };
  if (code === 85 || code === 86) return { th: 'หิมะตกเป็นช่วง ๆ', emoji: '🌨️' };
  if (code === 95) return { th: 'พายุฝนฟ้าคะนอง', emoji: '⛈️' };
  if (code === 96 || code === 99) return { th: 'พายุฝนฟ้าคะนอง มีลูกเห็บ', emoji: '⛈️' };
  return { th: 'ไม่ทราบ', emoji: '🌡️' };
}

/** คำแนะนำสั้น ๆ จากตัวเลขพยากรณ์ (ทั่วไป ไม่ใช่คำเตือนทางการ) */
export function tips(w: WeatherDay): string[] {
  const out: string[] = [];
  if (w.snow > 0 || w.tMin <= 0) out.push('พื้นอาจเป็นน้ำแข็ง/ลื่น ใส่รองเท้ากันลื่น');
  if (w.tMax <= 5) out.push('หนาวมาก ใส่เสื้อหลายชั้น หมวก ถุงมือ');
  if ((w.pop ?? 0) >= 60 && w.snow === 0) out.push('มีโอกาสฝนสูง พกร่ม');
  if (w.snow >= 5) out.push('หิมะสะสมมาก รถไฟ/รถบัสอาจล่าช้า');
  if (w.wind >= 30) out.push('ลมแรง จะรู้สึกหนาวกว่าตัวเลข');
  return out;
}

/** ตำแหน่งที่ใช้ดูอากาศของวันนั้น: ที่พักของวันนั้น → จุดแรกในแผน → ที่พักวันก่อนหน้า → เมืองหลักของประเทศ */
export function dayLocation(places: Place[], day: number, country: Country): { lat: number; lng: number; name: string } {
  const ofDay = places.filter((p) => p.day === day).sort((a, b) => a.order - b.order);
  const pick = ofDay.find((p) => p.kind === 'hotel') ?? ofDay[0];
  if (pick) return { lat: pick.lat, lng: pick.lng, name: pick.title };
  const prevHotel = places
    .filter((p) => p.kind === 'hotel' && p.day < day)
    .sort((a, b) => b.day - a.day || b.order - a.order)[0];
  if (prevHotel) return { lat: prevHotel.lat, lng: prevHotel.lng, name: prevHotel.title };
  const c = countryOf(country);
  return { lat: c.center[0], lng: c.center[1], name: c.centerName };
}

async function fetchForecast(lat: number, lng: number): Promise<WeatherCache> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,snowfall_sum,wind_speed_10m_max' +
    '&timezone=auto&forecast_days=16&past_days=1'; // auto = เวลาท้องถิ่นของพิกัด (ญี่ปุ่น/จีน)
  const res = await fetch(url);
  if (!res.ok) throw new Error('โหลดพยากรณ์อากาศไม่สำเร็จ');
  const j = await res.json();
  const d = j.daily ?? {};
  const days: WeatherDay[] = (d.time ?? []).map((date: string, i: number) => ({
    date,
    code: d.weather_code?.[i] ?? -1,
    tMax: d.temperature_2m_max?.[i] ?? NaN,
    tMin: d.temperature_2m_min?.[i] ?? NaN,
    pop: d.precipitation_probability_max?.[i] ?? null,
    snow: d.snowfall_sum?.[i] ?? 0,
    wind: d.wind_speed_10m_max?.[i] ?? 0,
  }));
  return { key: locKey(lat, lng), fetchedAt: Date.now(), days };
}

const inflight = new Map<string, Promise<void>>();

/** โหลดใหม่ถ้าแคชเก่า/ไม่มี — ถ้าเครื่องออฟไลน์จะข้ามเงียบ ๆ (ใช้แคชเดิม) ถ้าโหลดพลาดจะโยน error */
export function refreshWeather(lat: number, lng: number, force = false): Promise<void> {
  const key = locKey(lat, lng);
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const cur = await db.weather.get(key);
    if (!force && cur && Date.now() - cur.fetchedAt < STALE_MS) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    await db.weather.put(await fetchForecast(lat, lng));
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export type WeatherStatus = 'no-date' | 'loading' | 'ok' | 'not-yet' | 'past' | 'offline';

/** อากาศของ "วันที่ N" ในทริป ตามตำแหน่งในแผนของวันนั้น */
export function useDayWeather(settings: Settings, places: Place[], day: number) {
  const loc = dayLocation(places, day, settings.country);
  const key = locKey(loc.lat, loc.lng);
  // null = ยังไม่เคยโหลด, undefined = กำลังอ่านจาก IndexedDB
  const cache = useLiveQuery(async () => (await db.weather.get(key)) ?? null, [key]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load(force = false) {
    setBusy(true);
    setError(false);
    try {
      await refreshWeather(loc.lat, loc.lng, force);
    } catch {
      setError(true);
    }
    setBusy(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const d = dayDate(settings, day);
  const date = d ? ymd(d) : '';
  const weather = date ? cache?.days.find((w) => w.date === date) : undefined;

  let status: WeatherStatus;
  if (!date) status = 'no-date';
  else if (weather) status = 'ok';
  else if (cache === undefined || busy) status = 'loading';
  else if (!cache) status = 'offline'; // ไม่มีแคชและโหลดไม่ได้ (ไม่มีเน็ต)
  else if (cache.days.length && date > cache.days[cache.days.length - 1].date) status = 'not-yet';
  else status = 'past';

  return { loc, date, weather, status, fetchedAt: cache?.fetchedAt ?? 0, busy, error, reload: () => load(true) };
}
