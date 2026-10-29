// แยก "ยอดรวม" และรายการสินค้าจากข้อความใบเสร็จที่ OCR ได้ (ญี่ปุ่น / จีน)
// หลักคิด: หาบรรทัดที่มีคำว่า 合計/お会計 (ญี่ปุ่น) หรือ 合计/应付 (จีน) ฯลฯ แล้วเอาตัวเลขในบรรทัดนั้น (หรือบรรทัดถัดไป)
// ถ้าไม่เจอ ค่อยเดาจากตัวเลขที่มีเครื่องหมาย ¥ / 円 / 元 ที่ใหญ่ที่สุด
// OCR ไม่สมบูรณ์เสมอ จึงคืน "ตัวเลือก" หลายค่าให้ผู้ใช้กดเลือกหรือแก้เองก่อนบันทึก
import type { Country } from './country';

export interface ReceiptGuess {
  total: number | null;
  candidates: number[];
  lines: string[];
}

interface Rules {
  total: RegExp; // บรรทัดยอดรวม
  subtotal: RegExp;
  skip: RegExp; // บรรทัดยอดย่อยที่ไม่ควรนับ
  tender: RegExp; // เงินที่รับมา/เงินทอน — ไม่ใช่ยอดรวม
  notItem: RegExp; // บรรทัดที่ไม่ใช่สินค้า
  amount: RegExp; // ตัวเลขเงินในบรรทัด (กลุ่ม 1 = สัญลักษณ์หน้า, 2 = ตัวเลข, 3 = หน่วยหลัง)
  itemLine: RegExp; // บรรทัดสินค้าที่ลงท้ายด้วยราคา (กลุ่ม 1 = ชื่อ, 2 = ราคา)
  qty: RegExp; // จำนวนท้ายชื่อ เช่น x2, 2個
}

const RULES: Record<Country, Rules> = {
  JP: {
    total: /合\s*計|お?\s*買\s*上|お?\s*会\s*計|ご?\s*請\s*求|総\s*合?\s*計|お?\s*支\s*払|税\s*込|total|amount/i,
    subtotal: /小\s*計|sub\s*total/i,
    skip: /お?\s*預\s*(か)?り|お?\s*釣|つり|change|cash\b|ポイント|point|tel|電話|登録番号|領収|No\.?\s*\d/i,
    tender: /お?\s*預|お?\s*釣|つり|change/i,
    notItem:
      /合\s*計|小\s*計|総\s*計|お?\s*会\s*計|お?\s*買\s*上|お?\s*支\s*払|お?\s*預|お?\s*釣|つり|税|対象|点数|現金|クレジット|カード|電子マネー|交通系|paypay|ポイント|登録番号|領収|レシート|tel|電話|〒|no\.|担当|レジ\s*\d|total|change|cash|visa|master/i,
    amount: /([¥\\]?)\s*(\d{1,3}(?:[,.]\d{3})+|\d{1,7})\s*(円?)/g,
    // ราคาท้ายบรรทัด อาจมี ¥ นำหน้า 円 ตามหลัง และเครื่องหมายภาษี ※ * 軽 外 内 ปิดท้าย
    itemLine: /^(.*?)[\s¥\\]*(\d{1,3}(?:,\d{3})+|\d{1,6})\s*円?\s*[※*軽外内]*$/,
    qty: /(?:[x×@]\s*(\d{1,2})|(\d{1,2})\s*(?:個|点|本|コ))\s*$/i,
  },
  CN: {
    total: /合\s*计|总\s*计|应\s*付|应\s*收|实\s*付|总\s*额|付款金额|消费金额|total|amount/i,
    subtotal: /小\s*计|sub\s*total/i,
    skip: /会员|积分|电话|单号|流水|发票|tel/i,
    tender: /找\s*零|找\s*赎|实\s*收|现\s*金|收\s*款|支付宝|微信|银联|change|cash/i,
    notItem:
      /合\s*计|小\s*计|总\s*计|应\s*付|应\s*收|实\s*收|实\s*付|找\s*零|找\s*赎|现\s*金|支付宝|微信|银联|刷卡|会员|积分|发票|税|单号|流水|收银|电话|地址|日期|时间|门店|欢迎|谢谢|数量|单价|品名|优惠|折扣|total|change|cash|tel/i,
    // หยวนมีทศนิยม 2 ตำแหน่ง เช่น 12.50
    amount: /([¥\\]?)\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,6}(?:\.\d{1,2})?)\s*(元?)/g,
    itemLine: /^(.*?)[\s¥\\]*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,6}(?:\.\d{1,2})?)\s*元?\s*$/,
    qty: /(?:[x×*]\s*(\d{1,2})|(\d{1,2})\s*(?:个|件|瓶|杯|份|盒|包))\s*$/i,
  },
};

const toNumber = (country: Country, raw: string): number =>
  country === 'CN' ? parseFloat(raw.replace(/,/g, '')) : parseInt(raw.replace(/[,.]/g, ''), 10);

interface Hit {
  value: number;
  index: number;
  hasSym: boolean;
}

function amountsIn(line: string, country: Country): Hit[] {
  const out: Hit[] = [];
  const re = new RegExp(RULES[country].amount);
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (!m[0].trim()) {
      re.lastIndex++;
      continue;
    }
    const before = line[m.index - 1] ?? '';
    const afterIdx = m.index + m[0].length;
    const after = line[afterIdx] ?? '';
    if (/[/:\-%％]/.test(before) || /[/:\-%％]/.test(after)) continue; // วันที่ เวลา เบอร์ เปอร์เซ็นต์
    const value = toNumber(country, m[2]);
    if (!isFinite(value) || value <= 0 || value > 1_000_000) continue;
    out.push({ value, index: m.index, hasSym: !!m[1] || !!m[3] });
  }
  return out;
}

/** เลือกยอดเงินในบรรทัด: ตัวที่มี ¥/円/元 ก่อน ไม่งั้นเอาตัวขวาสุด (เช่น "合計 3点 1,234" → 1,234) */
function pickAmount(hits: Hit[]): number {
  const sym = hits.filter((h) => h.hasSym);
  const list = sym.length ? sym : hits;
  return list[list.length - 1].value;
}

const splitLines = (raw: string) =>
  raw
    .normalize('NFKC') // ￥→¥ , ตัวเลขเต็มความกว้าง→ปกติ
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

export function guessReceipt(rawText: string, country: Country = 'JP'): ReceiptGuess {
  const R = RULES[country];
  const lines = splitLines(rawText);

  const strong: number[] = [];
  const weak: number[] = [];
  const symAmounts: number[] = [];
  const all: number[] = [];

  lines.forEach((line, i) => {
    const hits = amountsIn(line, country);
    hits.forEach((h) => {
      all.push(h.value);
      if (h.hasSym) symAmounts.push(h.value);
    });
    if (R.tender.test(line)) return; // เงินที่รับมา/ทอน ไม่ใช่ยอดรวม

    if (R.total.test(line)) {
      const found = hits.length ? hits : amountsIn(lines[i + 1] ?? '', country);
      if (found.length) strong.push(pickAmount(found));
    } else if (R.subtotal.test(line) && !R.skip.test(line)) {
      const found = hits.length ? hits : amountsIn(lines[i + 1] ?? '', country);
      if (found.length) weak.push(pickAmount(found));
    }
  });

  const uniq = (xs: number[]) => Array.from(new Set(xs));
  const biggestSym = symAmounts.length ? [Math.max(...symAmounts)] : [];
  const biggestAny = all.length ? [Math.max(...all)] : [];

  const candidates = uniq([...strong, ...weak, ...biggestSym, ...biggestAny, ...uniq(all).sort((a, b) => b - a)]).slice(0, 8);
  return { total: candidates.length ? candidates[0] : null, candidates, lines };
}

export interface ReceiptItem {
  name: string; // ชื่อสินค้าตามที่ OCR อ่านได้ (ญี่ปุ่น/จีน)
  price: number;
  qty: number;
}

/** ดึงรายการสินค้า (ชื่อ + ราคา) จากข้อความใบเสร็จ — ใช้บรรทัดที่ลงท้ายด้วยราคา และไม่ใช่บรรทัดยอดรวม/ภาษี/เงินทอน */
export function parseItems(rawText: string, country: Country = 'JP'): ReceiptItem[] {
  const R = RULES[country];
  const items: ReceiptItem[] = [];
  for (const line of splitLines(rawText)) {
    if (R.notItem.test(line)) continue;
    const m = line.match(R.itemLine);
    if (!m) continue;
    let name = m[1].trim();
    if (/[-−/:%]/.test(name.slice(-1))) continue; // ส่วนลด (-50) วันที่ เวลา เปอร์เซ็นต์
    let qty = 1;
    const q = name.match(R.qty);
    if (q) {
      qty = parseInt(q[1] ?? q[2], 10) || 1;
      name = name.slice(0, q.index).trim();
    }
    // ใบเสร็จจีนมักเป็นคอลัมน์ "ชื่อ จำนวน ราคาต่อหน่วย ยอด" → ตัดตัวเลขท้ายชื่อออก (จำนวนเต็มเล็ก ๆ = จำนวนชิ้น)
    let tail: RegExpMatchArray | null;
    while ((tail = name.match(/\s+(\d+(?:\.\d+)?)$/))) {
      const n = tail[1];
      if (qty === 1 && /^\d{1,2}$/.test(n)) qty = parseInt(n, 10) || 1;
      name = name.slice(0, tail.index).trim();
    }
    name = name
      .replace(/^[\d\s]{4,}/, '') // รหัสสินค้า/บาร์โค้ดหน้าชื่อ
      .replace(/^[*※・\-\s]+/, '')
      .replace(/[\s.・…]+$/, '')
      .trim();
    // ต้องมีตัวอักษรจริง (คานะ/ฮั่นจื่อ/อังกฤษ) อย่างน้อย 2 ตัว ไม่ใช่เศษ OCR
    if ((name.match(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z]/gu) ?? []).length < 2) continue;
    const price = toNumber(country, m[2]);
    if (!(price > 0) || price > 1_000_000) continue;
    items.push({ name, price, qty });
  }
  return items.slice(0, 40);
}
