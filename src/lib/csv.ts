// นำเข้า/ส่งออกแผนเที่ยวเป็น CSV (เปิด/แก้ได้ใน Numbers, Google Sheets, Excel)
// หัวคอลัมน์รับได้ทั้งไทยและอังกฤษ ลำดับคอลัมน์ไม่สำคัญ
import type { Place, PlaceKind } from './db';
import { parseLatLng } from './geo';

/** แยก CSV แบบมาตรฐาน (รองรับ "ข้อความ, มีจุลภาค" และ "" ในเครื่องหมายคำพูด) เดาตัวคั่น , ; หรือ แท็บ */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

type Field = 'day' | 'title' | 'kind' | 'time' | 'lat' | 'lng' | 'link' | 'note' | 'booking' | 'checkin';

const ALIASES: Record<Field, string[]> = {
  day: ['วัน', 'วันที่', 'day', 'date'],
  title: ['ชื่อ', 'ชื่อสถานที่', 'สถานที่', 'title', 'name', 'place'],
  kind: ['ประเภท', 'ชนิด', 'kind', 'type'],
  time: ['เวลา', 'time'],
  lat: ['ละติจูด', 'lat', 'latitude'],
  lng: ['ลองจิจูด', 'lng', 'lon', 'long', 'longitude'],
  link: ['ลิงก์', 'ลิ้งก์', 'ลิงค์', 'แผนที่', 'link', 'url', 'map', 'google maps'],
  note: ['โน้ต', 'หมายเหตุ', 'รายละเอียด', 'note', 'notes'],
  booking: ['รหัสจอง', 'booking', 'booking code', 'reservation'],
  checkin: ['เช็กอิน', 'เช็คอิน', 'check-in', 'checkin', 'check in'],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function mapHeader(header: string[]): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const f of Object.keys(ALIASES) as Field[]) {
      if (out[f] === undefined && ALIASES[f].includes(n)) out[f] = i;
    }
  });
  return out;
}

export interface CsvRow {
  line: number; // เลขบรรทัดในไฟล์ (นับหัวตารางเป็นบรรทัด 1)
  day: number;
  title: string;
  kind: PlaceKind;
  time: string;
  lat: number | null;
  lng: number | null;
  geocoded: boolean;
  note: string;
  bookingCode: string;
  checkIn: string;
  problems: string[];
  duplicate: boolean;
}

/** "วันที่" ในไฟล์เป็นเลขวัน (1, 2, …) หรือวันที่จริง (2026-12-03, 3/12/2026) ก็ได้ */
function toDay(raw: string, tripStart: string, days: number): number | string {
  const s = raw.trim();
  if (/^\d{1,2}$/.test(s)) {
    const n = parseInt(s, 10);
    return n >= 1 && n <= days ? n : `วันที่ ${n} อยู่นอกทริป (มี ${days} วัน)`;
  }
  let d: Date | null = null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) d = new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // แบบไทย วัน/เดือน/ปี (ค.ศ. หรือ พ.ศ.)
  if (m) d = new Date(+m[3] > 2400 ? +m[3] - 543 : +m[3], +m[2] - 1, +m[1]);
  if (!d || isNaN(d.getTime())) return s ? `อ่านวันที่ “${s}” ไม่ออก` : 'ไม่มีวันที่';
  if (!tripStart) return 'ใส่เป็นวันที่จริง ต้องตั้งวันเริ่มเดินทางในหน้าตั้งค่าก่อน';
  const start = new Date(tripStart + 'T00:00:00');
  const n = Math.round((d.getTime() - start.getTime()) / 86400000) + 1;
  return n >= 1 && n <= days ? n : `${s} อยู่นอกช่วงทริป`;
}

function toTime(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

const HOTEL_RE = /โรงแรม|ที่พัก|เรียวกัง|hotel|hostel|ryokan|inn|stay/i;

export interface CsvParseResult {
  rows: CsvRow[];
  error?: string;
}

export function readPlanCsv(text: string, opts: { tripStart: string; days: number; existing: Place[] }): CsvParseResult {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: 'ไฟล์ว่าง หรือมีแต่หัวตาราง' };
  const col = mapHeader(table[0]);
  if (col.title === undefined || col.day === undefined) {
    return { rows: [], error: 'ไม่พบคอลัมน์ “วัน” และ “ชื่อ” — ลองดาวน์โหลดแม่แบบแล้วกรอกตามนั้น' };
  }
  const get = (r: string[], f: Field) => (col[f] !== undefined ? (r[col[f]!] ?? '').trim() : '');
  const seen = new Set(opts.existing.map((p) => `${p.day}|${norm(p.title)}`));

  const rows = table.slice(1).map((r, i): CsvRow => {
    const problems: string[] = [];
    const title = get(r, 'title');
    if (!title) problems.push('ไม่มีชื่อสถานที่');
    const dayOrErr = toDay(get(r, 'day'), opts.tripStart, opts.days);
    const day = typeof dayOrErr === 'number' ? dayOrErr : 0;
    if (typeof dayOrErr === 'string') problems.push(dayOrErr);

    let lat: number | null = parseFloat(get(r, 'lat'));
    let lng: number | null = parseFloat(get(r, 'lng'));
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      const fromLink = parseLatLng(get(r, 'link'));
      lat = fromLink?.lat ?? null;
      lng = fromLink?.lng ?? null;
    }

    const kindRaw = get(r, 'kind');
    const kind: PlaceKind = HOTEL_RE.test(kindRaw) ? 'hotel' : 'spot';
    const key = `${day}|${norm(title)}`;
    const duplicate = seen.has(key);
    seen.add(key);

    return {
      line: i + 2,
      day,
      title,
      kind,
      time: toTime(get(r, 'time')),
      lat,
      lng,
      geocoded: false,
      note: get(r, 'note'),
      bookingCode: kind === 'hotel' ? get(r, 'booking') : '',
      checkIn: kind === 'hotel' ? toTime(get(r, 'checkin')) || get(r, 'checkin') : '',
      problems,
      duplicate,
    };
  });
  return { rows };
}

const esc = (v: string | number) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const HEADER = ['วัน', 'ชื่อ', 'ประเภท', 'เวลา', 'ละติจูด', 'ลองจิจูด', 'ลิงก์', 'โน้ต', 'รหัสจอง', 'เช็กอิน'];

/** มี BOM นำหน้า เพื่อให้ Numbers/Excel อ่านภาษาไทยถูก */
function toCsv(rows: (string | number)[][]): Blob {
  const body = [HEADER, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  return new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
}

export function templateCsv(): Blob {
  return toCsv([
    [1, 'โรงแรมใกล้สถานีซัปโปโร', 'ที่พัก', '', '43.0675', '141.3525', '', 'เช็กอินบ่ายสาม', 'ABC-12345', '15:00'],
    [1, 'สวนโอโดริ', 'เที่ยว', '16:00', '', '', 'https://www.google.com/maps/@43.0605,141.347,17z', 'วางลิงก์ Google Maps แทนพิกัดได้', '', ''],
    [2, 'Nijo Market', 'เที่ยว', '09:00', '', '', '', 'ไม่มีพิกัด → กด “ค้นหาพิกัด” ในแอป', '', ''],
  ]);
}

export function exportPlanCsv(places: Place[]): Blob {
  const sorted = [...places].sort((a, b) => a.day - b.day || a.order - b.order);
  return toCsv(
    sorted.map((p) => [
      p.day,
      p.title,
      p.kind === 'hotel' ? 'ที่พัก' : 'เที่ยว',
      p.time,
      p.lat.toFixed(6),
      p.lng.toFixed(6),
      '',
      p.note,
      p.bookingCode,
      p.checkIn,
    ]),
  );
}
