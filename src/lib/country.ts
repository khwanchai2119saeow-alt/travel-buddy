// ค่าที่ต่างกันตามประเทศของทริป (ญี่ปุ่น / จีน) — เพิ่มประเทศใหม่ได้ที่ไฟล์นี้ไฟล์เดียว
export type Country = 'JP' | 'CN';

export interface CountryInfo {
  code: Country;
  name: string; // ชื่อไทย
  flag: string;
  curName: string; // ชื่อสกุลเงินภาษาไทย
  sym: string; // สัญลักษณ์หน้าตัวเลข
  badge: string; // ตัวอักษรเดียวไว้ใส่ไอคอนวงกลม
  decimals: number; // ทศนิยมของเงิน (เยนไม่มี หยวนมี 2 ตำแหน่ง)
  rateUnit: number; // ตั้งเรทเป็น "rateUnit หน่วย = กี่บาท" (100 เยน / 1 หยวน)
  defaultRate: number; // บาทต่อ 1 หน่วย — ค่าสมมติ ผู้ใช้ต้องตั้งเรทจริงเอง
  center: [number, number]; // จุดกลางแผนที่/อากาศเมื่อยังไม่มีแผน
  centerName: string;
  ocrLang: string; // ภาษาของ Tesseract
  ttsLang: string; // ภาษาเสียงอ่าน
  mtLang: string; // รหัสภาษาสำหรับแปลออนไลน์ (MyMemory)
  langName: string; // ชื่อภาษาไทย
  geoCode: string; // countrycodes ของ Nominatim
  taxes: number[]; // ภาษีที่มักบวกหน้าร้าน (ญี่ปุ่นป้ายราคาบางร้านยังไม่รวมภาษี)
  emergency: { num: string; label: string; emoji: string }[];
  nav: 'google' | 'apple'; // แอปนำทางหลัก (ในจีน Google ใช้ไม่ได้ถ้าไม่มี VPN → ใช้ Apple Maps)
}

export const COUNTRIES: Record<Country, CountryInfo> = {
  JP: {
    code: 'JP',
    name: 'ญี่ปุ่น',
    flag: '🇯🇵',
    curName: 'เยน',
    sym: '¥',
    badge: '¥',
    decimals: 0,
    rateUnit: 100,
    defaultRate: 0.23,
    center: [43.0687, 141.3508],
    centerName: 'ซัปโปโร',
    ocrLang: 'jpn+eng',
    ttsLang: 'ja-JP',
    mtLang: 'ja',
    langName: 'ญี่ปุ่น',
    geoCode: 'jp',
    taxes: [8, 10],
    emergency: [
      { num: '110', label: 'ตำรวจ', emoji: '🚓' },
      { num: '119', label: 'ดับเพลิง / รถพยาบาล', emoji: '🚑' },
    ],
    nav: 'google',
  },
  CN: {
    code: 'CN',
    name: 'จีน',
    flag: '🇨🇳',
    curName: 'หยวน',
    sym: 'CN¥',
    badge: '元',
    decimals: 2,
    rateUnit: 1,
    defaultRate: 4.5,
    center: [39.9042, 116.4074],
    centerName: 'ปักกิ่ง',
    ocrLang: 'chi_sim+eng',
    ttsLang: 'zh-CN',
    mtLang: 'zh-CN',
    langName: 'จีน',
    geoCode: 'cn',
    taxes: [],
    emergency: [
      { num: '110', label: 'ตำรวจ', emoji: '🚓' },
      { num: '120', label: 'รถพยาบาล', emoji: '🚑' },
      { num: '119', label: 'ดับเพลิง', emoji: '🚒' },
    ],
    nav: 'apple',
  },
};

export const COUNTRY_LIST = Object.values(COUNTRIES);

export const countryOf = (c: Country | undefined): CountryInfo => COUNTRIES[c ?? 'JP'] ?? COUNTRIES.JP;
