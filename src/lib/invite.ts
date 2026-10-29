// เชิญเพื่อนเข้าทริป (ไม่มีเซิร์ฟเวอร์): ข้อมูลพื้นฐานของทริปถูกเข้ารหัสไว้หลังเครื่องหมาย # ของลิงก์
// ส่วนหลัง # เบราว์เซอร์ไม่ส่งไปเซิร์ฟเวอร์ใด ๆ — ลิงก์/QR นี้จึงพาข้อมูลจากเครื่องถึงเครื่องโดยตรง
// มีแค่ชื่อทริป ประเทศ วันที่ เรท และรายชื่อสมาชิก (ไม่มีค่าใช้จ่าย/รูป — อันนั้นส่งด้วย "ส่งอัปเดตให้กลุ่ม")
import { BASE } from './base';
import { db, getAppSettings, newMemberId, type Member, type Trip } from './db';

export interface InvitePayload {
  v: 1;
  trip: Omit<Trip, 'id'>;
}

const toB64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromB64Url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
};

export function inviteCode(trip: Trip): string {
  const { id, ...rest } = trip;
  void id;
  return toB64Url(JSON.stringify({ v: 1, trip: rest } satisfies InvitePayload));
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}${BASE}/join/#t=${code}`;
}

/** อ่านรหัสเชิญจากลิงก์เต็ม / ข้อความที่มี #t=… / รหัสเปล่า ๆ — อ่านไม่ได้คืน null */
export function decodeInvite(input: string): InvitePayload | null {
  const s = input.trim();
  const m = s.match(/[#&?]t=([A-Za-z0-9_-]+)/);
  const code = m ? m[1] : /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : '';
  if (!code) return null;
  try {
    const p = JSON.parse(fromB64Url(code)) as InvitePayload;
    const t = p?.trip;
    if (p?.v !== 1 || !t?.uid || !t.name || !Array.isArray(t.members) || (t.country !== 'JP' && t.country !== 'CN')) return null;
    return p;
  } catch {
    return null;
  }
}

/** เข้าร่วมทริป: ยังไม่มี → สร้างด้วย uid เดียวกับของเพื่อน (อัปเดตที่ส่งกันจะรวมเข้าทริปเดียวกัน) · มีแล้ว → รวมรายชื่อ
 *  me = id สมาชิกที่เป็นเรา หรือ { newName } ถ้าไม่อยู่ในรายชื่อ */
export async function joinTrip(p: InvitePayload, me: string | { newName: string }): Promise<string> {
  const incoming = p.trip;
  let members: Member[] = incoming.members;
  let meId = typeof me === 'string' ? me : '';
  if (typeof me !== 'string') {
    meId = newMemberId();
    members = [...members, { id: meId, name: me.newName }];
  }
  const local = await db.trips.where('uid').equals(incoming.uid).first();
  if (local) {
    const have = new Set(local.members.map((m) => m.id));
    await db.trips.update(local.id!, { members: [...local.members, ...members.filter((m) => !have.has(m.id))] });
  } else {
    await db.trips.add({ ...incoming, members });
  }
  const app = await getAppSettings();
  await db.settings.put({ ...app, activeTrip: incoming.uid, me: { ...app.me, [incoming.uid]: meId } });
  return incoming.uid;
}

/** อ่าน QR จากรูปถ่าย (ทำในเครื่อง ไม่ใช้เน็ต) คืนข้อความใน QR หรือ null */
export async function readQrFromImage(file: Blob): Promise<string | null> {
  const jsQR = (await import('jsqr')).default;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('เปิดรูปไม่ได้'));
      i.src = url;
    });
    // ลองหลายขนาด — รูปจากกล้อง iPhone ใหญ่มาก ย่อแล้วอ่านเร็วและแม่นขึ้น
    for (const max of [1000, 1600, 600]) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      const hit = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
      if (hit?.data) return hit.data;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** รูป QR (data URL) ของข้อความ — สร้างในเครื่อง */
export async function qrDataUrl(text: string): Promise<string> {
  const qrcode = (await import('qrcode-generator')).default;
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  return qr.createDataURL(6, 2);
}
