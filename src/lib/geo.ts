// ตัวช่วยเรื่องพิกัด: ดึงพิกัดจากลิงก์ Google Maps, ค้นหาชื่อสถานที่ (Nominatim ของ OSM — ฟรี), ลิงก์นำทาง

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
  name: string;
  lat: number;
  lng: number;
}

/** ค้นหาชื่อสถานที่ผ่าน Nominatim (ต้องมีเน็ต, เรียกเมื่อผู้ใช้กดค้นหาเท่านั้น เพื่อไม่ละเมิดนโยบายการใช้งาน) */
export async function searchPlace(query: string): Promise<GeoResult[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=th&q=' +
    encodeURIComponent(query);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('ค้นหาไม่สำเร็จ');
  const rows: { display_name: string; lat: string; lon: string }[] = await res.json();
  return rows.map((r) => ({ name: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }));
}

/** หาพิกัดแรกที่เจอในประเทศที่กำหนด (countrycodes เช่น jp, cn — ใช้ตอนนำเข้า CSV ที่ไม่มีพิกัด) — ผู้เรียกต้องเว้นระยะ ≥ 1 วินาทีต่อครั้ง ตามนโยบาย Nominatim */
export async function geocodeIn(query: string, countryCode: string): Promise<GeoResult | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=${countryCode}&accept-language=th&q=` +
    encodeURIComponent(query);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('ค้นหาไม่สำเร็จ');
  const rows: { display_name: string; lat: string; lon: string }[] = await res.json();
  return rows[0] ? { name: rows[0].display_name, lat: parseFloat(rows[0].lat), lng: parseFloat(rows[0].lon) } : null;
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
