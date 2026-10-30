// ตัวช่วยเรื่องพิกัด: ดึงพิกัดจากลิงก์ Google Maps, ค้นหาชื่อสถานที่ (Nominatim + Photon — ฟรี), ลิงก์นำทาง
import { myMemory } from './translate';

export interface LatLng {
  lat: number;
  lng: number;
}

const valid = (lat: number, lng: number) =>
  isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** รองรับลิงก์ที่มี @lat,lng / !3dlat!4dlng / q=lat,lng และข้อความพิกัดเปล่า ๆ เช่น "43.06, 141.35"
 *  (ลิงก์สั้น maps.app.goo.gl อ่านออฟไลน์ไม่ได้ ต้องเปิดแล้วคัดลอกลิงก์ยาวแทน) */
export function parseLatLng(input: string): LatLng | null {
  const s = decodeURIComponent(input.trim());
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /[?&](?:q|query|ll|destination|daddr)=(-?\d+\.\d+)[,\s+]+(-?\d+\.\d+)/,
    /^(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)$/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (valid(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

export interface GeoResult {
  name: string; // ชื่อสถานที่
  detail: string; // ที่อยู่/เมือง
  lat: number;
  lng: number;
}

interface SearchArea {
  geoCode: string; // countrycodes เช่น jp, cn
  mtLang: string; // ภาษาท้องถิ่นสำหรับแปลชื่อ
  center: [number, number]; // ให้ผลใกล้เมืองนี้ขึ้นก่อน
}

async function nominatim(query: string, area: SearchArea): Promise<GeoResult[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=${area.geoCode}&accept-language=th,en&q=` +
    encodeURIComponent(query);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('ค้นหาไม่สำเร็จ');
  const rows: { display_name: string; lat: string; lon: string }[] = await res.json();
  return rows.map((r) => {
    const [name, ...rest] = r.display_name.split(', ');
    return { name, detail: rest.slice(0, 3).join(', '), lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
  });
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; street?: string; city?: string; state?: string; countrycode?: string };
}

async function photon(query: string, area: SearchArea): Promise<GeoResult[]> {
  const url = `https://photon.komoot.io/api/?limit=6&lat=${area.center[0]}&lon=${area.center[1]}&q=` + encodeURIComponent(query);
  const res = await fetch(url);
  if (!res.ok) throw new Error('ค้นหาไม่สำเร็จ');
  const data: { features: PhotonFeature[] } = await res.json();
  return data.features
    .filter((f) => f.properties.countrycode?.toLowerCase() === area.geoCode && f.properties.name)
    .map((f) => ({
      name: f.properties.name!,
      detail: [f.properties.street, f.properties.city, f.properties.state].filter(Boolean).join(', '),
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    }));
}

const hasThai = (s: string) => /[\u0E00-\u0E7F]/.test(s);

/** ค้นหาชื่อสถานที่ (ฟรี ไม่ต้องใช้ key ต้องมีเน็ต เรียกเมื่อผู้ใช้กดค้นหาเท่านั้น)
 *  บริการแผนที่ฟรีแทบไม่รู้จักชื่อภาษาไทย จึงแปลเป็นอังกฤษ/ภาษาท้องถิ่นก่อนแล้วค้นทั้งสองแหล่ง
 *  Nominatim จำกัด 1 ครั้ง/วินาที → ใช้แค่คำเดียวต่อการกด ส่วนคำอื่นค้นจาก Photon */
export async function searchPlace(query: string, area: SearchArea): Promise<GeoResult[]> {
  const q = query.trim();
  const variants = [q];
  if (hasThai(q)) {
    const tr = await Promise.allSettled([myMemory(q, 'th', 'en'), myMemory(q, 'th', area.mtLang)]);
    const found = tr.flatMap((r) => (r.status === 'fulfilled' && !hasThai(r.value) ? [r.value.trim()] : []));
    variants.unshift(...new Set(found));
  }
  const settled = await Promise.allSettled([nominatim(variants[0], area), ...variants.map((v) => photon(v, area))]);
  if (settled.every((r) => r.status === 'rejected')) throw new Error('ค้นหาไม่สำเร็จ');
  const seen = new Set<string>();
  const out: GeoResult[] = [];
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const g of r.value) {
      const key = `${g.lat.toFixed(3)},${g.lng.toFixed(3)}`; // จุดเดียวกัน (~100 ม.) แสดงครั้งเดียว
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(g);
    }
  }
  return out.slice(0, 8);
}

/** เปิดค้นหาชื่อนี้ในแอป Google Maps (ลิงก์ฟรี ไม่ต้องใช้ API key) */
export function googleSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function appleSearchUrl(query: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

/** ลิงก์เปิดนำทางในแอป Google Maps ของเครื่อง (มือถือจะเด้งเข้าแอปเอง) — ใช้ในจีนไม่ได้ถ้าไม่มี VPN */
export function navigationUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** ลิงก์นำทางใน Apple Maps (มีใน iPhone ทุกเครื่อง ใช้ได้ในจีน) */
export function appleNavigationUrl(lat: number, lng: number): string {
  return `https://maps.apple.com/?daddr=${lat},${lng}`;
}

export function appleViewUrl(lat: number, lng: number, title: string): string {
  return `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(title)}`;
}

export function viewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function currentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('เครื่องนี้ไม่รองรับระบุตำแหน่ง'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('ขอตำแหน่งไม่ได้ (ตรวจสอบสิทธิ์ตำแหน่งของเบราว์เซอร์)')),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}

/** ระยะทางเป็นเมตรระหว่าง 2 พิกัด (สูตร haversine) */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
