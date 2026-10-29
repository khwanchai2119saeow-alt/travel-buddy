'use client';
// จำเส้นทางที่เปิดภายในแอป เพื่อให้ปุ่มย้อนกลับแบบ iPhone รู้ว่าหน้าก่อนหน้าคืออะไร
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const norm = (p: string) => (p.endsWith('/') ? p : p + '/');
const stack: string[] = [];

/** ชื่อหน้าที่แสดงบนปุ่มย้อนกลับ (เหมือน iPhone ที่โชว์ชื่อหน้าก่อนหน้า) */
export const PAGE_TITLES: Record<string, string> = {
  '/': 'วันนี้',
  '/trip/': 'แผนเที่ยว',
  '/expenses/': 'ค่าใช้จ่าย',
  '/scan/': 'สแกน',
  '/translate/': 'แปล',
  '/summary/': 'สรุปทริป',
  '/settings/': 'ตั้งค่า',
  '/trips/': 'ทริปของฉัน',
  '/join/': 'เข้าร่วมทริป',
};

/** หน้าก่อนหน้าในแอป (null = เปิดหน้านี้เป็นหน้าแรก เช่นเปิดจากหน้าจอโฮม) */
export function previousPath(): string | null {
  return stack.length > 1 ? stack[stack.length - 2] : null;
}

/** วางไว้ใน layout ครั้งเดียว — บันทึกทุกครั้งที่เปลี่ยนหน้า */
export default function NavHistory() {
  const path = usePathname();
  useEffect(() => {
    if (!path) return;
    const p = norm(path);
    if (stack[stack.length - 1] === p) return;
    if (stack[stack.length - 2] === p) stack.pop(); // ย้อนกลับ
    else stack.push(p);
    if (stack.length > 30) stack.shift();
  }, [path]);
  return null;
}
