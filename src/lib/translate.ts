// แปลออนไลน์ด้วย MyMemory (ฟรี ไม่ต้องสมัคร/ไม่ใช้บัตร มีโควตาต่อวัน) — ใช้เป็นตัวเสริมตอนมีเน็ตเท่านั้น

const memo = new Map<string, string>();

export async function myMemory(text: string, from: string, to: string): Promise<string> {
  const q = text.slice(0, 450);
  const key = `${from}|${to}|${q}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${from}|${to}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('แปลไม่สำเร็จ');
  const j = await res.json();
  const out: string = j?.responseData?.translatedText ?? '';
  if (!out || j?.quotaFinished) throw new Error('ไม่มีผลแปล');
  memo.set(key, out);
  return out;
}
