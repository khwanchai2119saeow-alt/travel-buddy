import { db, newUid, type Place } from './db';
import type { Country } from './country';

type Seed = Omit<Place, 'id' | 'uid' | 'tripUid' | 'createdAt' | 'visited' | 'photo' | 'sample'>;

const P = (day: number, order: number, kind: Place['kind'], title: string, lat: number, lng: number, note = '', time = '', bookingCode = '', checkIn = ''): Seed => ({
  day,
  order,
  kind,
  title,
  lat,
  lng,
  note,
  time,
  bookingCode,
  checkIn,
});

// ข้อมูลตัวอย่าง (พิกัดโดยประมาณ) ให้เห็นภาพการใช้งาน — แก้ไข/ลบได้ทั้งหมด
const SAMPLES: Record<Country, Seed[]> = {
  JP: [
    P(1, 0, 'hotel', 'โรงแรม (ตัวอย่าง) ใกล้สถานีซัปโปโร', 43.0675, 141.3525, 'ใส่รหัสจองและเวลาเช็กอินจริงที่นี่', '', 'ABC-12345', '15:00'),
    P(1, 1, 'spot', 'สถานีซัปโปโร', 43.0687, 141.3508, 'ฝากกระเป๋า / ซื้อบัตร IC', '14:00'),
    P(1, 2, 'spot', 'สวนโอโดริ', 43.0605, 141.347, 'เดินเล่น ถ่ายรูป', '16:00'),
    P(1, 3, 'spot', 'ซูซูกิโนะ', 43.0545, 141.3538, 'มื้อเย็น ราเม็ง/ซุปแกง', '18:30'),
    P(2, 0, 'spot', 'ตลาดนิโจ', 43.0568, 141.3586, 'อาหารทะเลเช้า ๆ', '09:00'),
    P(2, 1, 'spot', 'หอนาฬิกาซัปโปโร', 43.0626, 141.3536, '', '11:00'),
    P(3, 0, 'spot', 'คลองโอตารุ', 43.1975, 141.0036, 'นั่งรถไฟจากซัปโปโรประมาณ 40 นาที', '10:30'),
  ],
  CN: [
    P(1, 0, 'hotel', 'โรงแรม (ตัวอย่าง) ย่านหวังฝูจิ่ง', 39.9139, 116.4108, 'ใส่รหัสจองและเวลาเช็กอินจริงที่นี่', '', 'ABC-12345', '14:00'),
    P(1, 1, 'spot', 'จัตุรัสเทียนอันเหมิน', 39.9055, 116.3976, 'พกพาสปอร์ต มีจุดตรวจความปลอดภัย', '09:00'),
    P(1, 2, 'spot', 'พระราชวังต้องห้าม (กู้กง)', 39.9163, 116.3972, 'ต้องจองตั๋วล่วงหน้า ปิดวันจันทร์', '10:00'),
    P(1, 3, 'spot', 'ถนนหวังฝูจิ่ง', 39.9139, 116.4108, 'ช้อปปิ้ง ของกินริมทาง', '18:00'),
    P(2, 0, 'spot', 'กำแพงเมืองจีน มู่เทียนอวี้', 40.4319, 116.5704, 'ไปเช้า นั่งกระเช้าขึ้น', '08:30'),
    P(3, 0, 'spot', 'หอฟ้าเทียนถาน', 39.8822, 116.4066, '', '09:30'),
    P(3, 1, 'spot', 'พระราชวังฤดูร้อน (อี๋เหอหยวน)', 39.9999, 116.2755, '', '13:30'),
  ],
};

export async function seedSamplePlaces(tripUid: string, country: Country): Promise<void> {
  const now = Date.now();
  await db.places.bulkAdd(
    SAMPLES[country].map((s, i) => ({ ...s, uid: newUid(), tripUid, visited: false, sample: true, createdAt: now + i })),
  );
}

export async function removeSamplePlaces(tripUid: string): Promise<void> {
  await db.places.where('tripUid').equals(tripUid).filter((p) => !!p.sample).delete();
}
