// ทดสอบตรรกะหลักของแอป (เงิน ใบเสร็จ CSV พิกัด ลิงก์เชิญ ตรวจไฟล์สำรอง) — รัน: npm test
// คอมไพล์ src/lib ไปที่ .test-out ด้วย tests/tsconfig.json ก่อน
const assert = require('node:assert/strict');
const L = (m) => require('../.test-out/lib/' + m + '.js');
const { guessReceipt, parseItems } = L('receipt');
const { parseCsv, readPlanCsv } = L('csv');
const { computePeople, sharersOf, payerName } = L('people');
const { parseLatLng, distanceMeters } = L('geo');
const F = L('format');
const { decodeInvite, inviteCode } = L('invite');
const { computeStats, effectiveRate } = L('stats');
const { glossItem, guessCategory } = L('receiptWords');
const { lookupSigns } = L('signs');

let pass = 0;
const fails = [];
function t(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fails.push(name + ' → ' + (e && e.message ? e.message.split('\n').slice(0, 6).join(' | ') : e));
  }
}

/* ---------- receipt (JP) ---------- */
const jp1 = `セブン-イレブン 札幌北口店
電話 011-123-4567
2026年03月12日(木) 18:42
おにぎり 鮭        150
コーヒー           130
ポテトチップス ×2  356
小計              ¥636
消費税等(8%)       ¥50
合計              ¥686
お預り           ¥1,000
お釣              ¥314`;
t('JP total from 合計', () => assert.equal(guessReceipt(jp1, 'JP').total, 686));
t('JP total not change/tender', () => assert.ok(!guessReceipt(jp1, 'JP').candidates.slice(0, 1).includes(1000)));
t('JP items', () => {
  const it = parseItems(jp1, 'JP');
  const names = it.map((i) => i.name);
  assert.ok(names.includes('おにぎり 鮭') || names.some((n) => n.startsWith('おにぎり')), JSON.stringify(it));
  assert.ok(names.includes('コーヒー'), JSON.stringify(it));
  const chips = it.find((i) => i.name.startsWith('ポテトチップス'));
  assert.ok(chips && chips.qty === 2 && chips.price === 356, JSON.stringify(it));
  assert.ok(!names.some((n) => /合計|小計|税|預|釣|電話/.test(n)), JSON.stringify(names));
});
t('JP full-width digits & ￥', () => assert.equal(guessReceipt('合計 ￥１，２３４', 'JP').total, 1234));
t('JP total on next line', () => assert.equal(guessReceipt('お会計\n2,480円\nお預り 3,000円', 'JP').total, 2480));
t('JP spaced OCR 合 計', () => assert.equal(guessReceipt('合 計 ¥980', 'JP').total, 980));
t('JP no numbers', () => assert.equal(guessReceipt('ありがとうございました', 'JP').total, null));
t('JP empty', () => {
  assert.equal(guessReceipt('', 'JP').total, null);
  assert.deepEqual(parseItems('', 'JP'), []);
});
t('JP date not amount', () => assert.ok(!guessReceipt('2026/03/12 18:42\n合計 500', 'JP').candidates.includes(2026)));
t('JP spaced katakana item name compacts', () => {
  const it = parseItems('コ ー ヒ ー 130', 'JP');
  assert.equal(it.length, 1);
  assert.equal(it[0].name, 'コーヒー');
});

/* ---------- receipt (CN) ---------- */
const cn1 = `北京便利店
可口可乐 2 3.50 7.00
矿泉水 2.00
合计 9.00
现金 10.00
找零 1.00`;
t('CN total', () => assert.equal(guessReceipt(cn1, 'CN').total, 9));
t('CN items', () => {
  const it = parseItems(cn1, 'CN');
  const cola = it.find((i) => i.name.includes('可口可乐'));
  assert.ok(cola, JSON.stringify(it));
  assert.equal(cola.price, 7);
  assert.equal(cola.qty, 2);
  assert.ok(it.some((i) => i.name === '矿泉水' && i.price === 2), JSON.stringify(it));
});
t('CN decimals', () => assert.equal(guessReceipt('应付 ¥12.50', 'CN').total, 12.5));

/* ---------- dictionary ---------- */
t('gloss JP', () => assert.ok(glossItem('おにぎり鮭', 'JP')));
t('gloss JP spaced', () => assert.ok(glossItem('お に ぎ り', 'JP'), 'spaces between kana should still match'));
t('gloss unknown', () => assert.equal(glossItem('ZZZZ', 'JP'), null));
t('guessCategory food', () => assert.equal(guessCategory(['おにぎり', 'コーヒー'], 'JP'), 'food'));
t('signs JP', () => assert.ok(lookupSigns('出 口', 'JP').length > 0));

/* ---------- CSV ---------- */
t('parseCsv quotes/commas/CRLF/BOM', () => {
  const rows = parseCsv('﻿วัน,ชื่อ,โน้ต\r\n1,"สวน, โอโดริ","เขา ""ว่า"" ดี"\r\n\r\n2,ตลาด,\r\n');
  assert.deepEqual(rows, [['วัน', 'ชื่อ', 'โน้ต'], ['1', 'สวน, โอโดริ', 'เขา "ว่า" ดี'], ['2', 'ตลาด', '']]);
});
t('parseCsv semicolon + tab', () => {
  assert.deepEqual(parseCsv('day;name\n1;A'), [['day', 'name'], ['1', 'A']]);
  assert.deepEqual(parseCsv('day\tname\n1\tA'), [['day', 'name'], ['1', 'A']]);
});
t('parseCsv multiline cell', () => assert.deepEqual(parseCsv('a,b\n1,"x\ny"'), [['a', 'b'], ['1', 'x\ny']]));
const opts = { tripStart: '2026-03-10', days: 6, existing: [{ day: 1, title: 'สวนโอโดริ' }] };
t('readPlanCsv basic', () => {
  const r = readPlanCsv(
    'วัน,ชื่อ,ประเภท,เวลา,ละติจูด,ลองจิจูด,ลิงก์\n1,โรงแรม A,ที่พัก,15.00,43.06,141.35,\n2,X,,9:5,,,"https://www.google.com/maps/@43.1,141.2,17z"\n2026-03-12,Y,,,,,\n12/03/2569,Z,,,,,\n2026/03/13,W,,,,,\n9,Out,,,,,\n1,สวนโอโดริ,,,,,\n,ไม่มีวัน,,,,,',
    opts,
  );
  assert.equal(r.error, undefined);
  const [a, b, c, d, w, e, f, g] = r.rows;
  assert.equal(a.kind, 'hotel');
  assert.equal(a.time, '15:00');
  assert.equal(a.lat, 43.06);
  assert.equal(b.lat, 43.1);
  assert.equal(b.lng, 141.2);
  assert.equal(b.time, '', 'malformed time 9:5 ignored');
  assert.equal(c.day, 3);
  assert.equal(d.day, 3, 'Thai BE date');
  assert.equal(w.day, 4, 'yyyy/mm/dd date: ' + JSON.stringify(w.problems));
  assert.ok(e.problems.length > 0);
  assert.equal(f.duplicate, true);
  assert.ok(g.problems.length > 0);
});
t('readPlanCsv missing columns', () => assert.ok(readPlanCsv('foo,bar\n1,2', opts).error));
t('readPlanCsv header only', () => assert.ok(readPlanCsv('วัน,ชื่อ', opts).error));
t('readPlanCsv date without tripStart', () => {
  const r = readPlanCsv('วัน,ชื่อ\n2026-03-12,Y', { ...opts, tripStart: '' });
  assert.ok(r.rows[0].problems.length);
});

/* ---------- geo ---------- */
t('parseLatLng forms', () => {
  assert.deepEqual(parseLatLng('https://www.google.com/maps/place/X/@43.0605,141.347,17z'), { lat: 43.0605, lng: 141.347 });
  assert.deepEqual(parseLatLng('https://www.google.com/maps/place/X/data=!3d43.1!4d141.2'), { lat: 43.1, lng: 141.2 });
  assert.deepEqual(parseLatLng('https://maps.google.com/?q=39.9,116.4'), { lat: 39.9, lng: 116.4 });
  assert.deepEqual(parseLatLng(' 43.06, 141.35 '), { lat: 43.06, lng: 141.35 });
  assert.deepEqual(parseLatLng('-33.86 151.2'), { lat: -33.86, lng: 151.2 });
  assert.equal(parseLatLng('hello'), null);
  assert.equal(parseLatLng('95.0, 10.0'), null);
  assert.equal(parseLatLng(''), null);
});
t('parseLatLng malformed % does not throw', () => assert.equal(parseLatLng('100% sure'), null));
t('parseLatLng integers', () => assert.deepEqual(parseLatLng('43, 141'), { lat: 43, lng: 141 }));
t('distance', () => {
  const d = distanceMeters({ lat: 43.0687, lng: 141.3508 }, { lat: 43.0605, lng: 141.347 });
  assert.ok(d > 900 && d < 1000, String(d));
  assert.equal(distanceMeters({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0);
});

/* ---------- format ---------- */
t('fmtCur JP/CN', () => {
  F.setActiveCountry('JP');
  assert.equal(F.fmtCur(1200), '¥1,200');
  assert.equal(F.fmtCur(0), '¥0');
  assert.equal(F.fmtCur(NaN), '¥0');
  F.setActiveCountry('CN');
  assert.equal(F.fmtCur(35.5), 'CN¥35.50');
  assert.equal(F.fmtCur(120), 'CN¥120');
  assert.equal(F.fmtCur(0.1 + 0.2), 'CN¥0.30');
  F.setActiveCountry('JP');
});
t('fmtThb', () => {
  assert.equal(F.fmtThb(1234.5), '฿1,234.50');
  assert.equal(F.fmtThb0(1234.5), '฿1,235');
});
t('dayDate/ymd', () => {
  assert.equal(F.ymd(F.dayDate({ tripStart: '2026-12-31' }, 2)), '2027-01-01');
  assert.equal(F.dayDate({ tripStart: '' }, 1), null);
  assert.equal(F.dayLabel({ tripStart: '' }, 3), 'วันที่ 3');
});
t('todayDay/inTripNow', () => {
  const today = F.ymd(new Date());
  assert.equal(F.todayDay({ tripStart: today, days: 5 }), 1);
  const d = new Date();
  d.setDate(d.getDate() - 2);
  assert.equal(F.todayDay({ tripStart: F.ymd(d), days: 5 }), 3);
  assert.equal(F.inTripNow({ tripStart: F.ymd(d), days: 5 }), true);
  assert.equal(F.inTripNow({ tripStart: F.ymd(d), days: 2 }), false);
  assert.equal(F.todayDay({ tripStart: F.ymd(d), days: 2 }), 1);
});
t('tripRangeText', () => {
  assert.match(F.tripRangeText({ tripStart: '2026-03-10', days: 6 }), /^10–15 มี\.ค\. 2569 · 6 วัน$/);
  assert.match(F.tripRangeText({ tripStart: '2026-12-30', days: 5 }), /30 ธ\.ค\. 2569 – 3 ม\.ค\. 2570/);
  assert.match(F.tripRangeText({ tripStart: '', days: 5 }), /ยังไม่ตั้งวันที่/);
});

/* ---------- money: stats + people ---------- */
const members = [
  { id: 'a', name: 'เอ' },
  { id: 'b', name: 'บี' },
  { id: 'c', name: 'ซี' },
];
const S = (over = {}) => ({
  uid: 't1', name: 'x', country: 'JP', tripStart: '2026-03-10', days: 3, fixedRate: 0.25, rateMode: 'fixed', rateLots: [],
  members, splitMode: 'split', me: 'a', nameA: 'เอ', notes: '', createdAt: 0, ...over,
});
t('effectiveRate fixed/lots', () => {
  assert.equal(effectiveRate(S()), 0.25);
  assert.equal(effectiveRate(S({ rateMode: 'lots', rateLots: [{ id: '1', jpy: 10000, thb: 2300 }, { id: '2', jpy: 10000, thb: 2500 }] })), 0.24);
  assert.equal(effectiveRate(S({ rateMode: 'lots', rateLots: [] })), 0.25);
  assert.equal(effectiveRate(S({ fixedRate: 0 })), 0);
});
t('computeStats', () => {
  const st = computeStats(S(), [{ thb: 1000 }], [
    { day: 1, jpy: 1000, category: 'food' },
    { day: 3, jpy: 2000, category: 'travel' },
    { day: 9, jpy: 400, category: 'other' },
  ]);
  assert.equal(st.tripTotalJpy, 3400);
  assert.equal(st.preTotalThb, 1000);
  assert.equal(st.grandThb, 1000 + 3400 * 0.25);
  assert.equal(st.perDay.length, 3);
  assert.equal(st.perDay[2].jpy, 2400, 'out-of-range day clamps to last');
  assert.equal(st.activeDays, 2);
});
t('people split settle', () => {
  // a pays 300 for all 3; b pays 90 for a+b
  const p = computePeople(S(), [{ thb: 300, payer: 'a' }, { thb: 90, payer: 'b', split: ['a', 'b'] }], [], 0.25);
  const by = Object.fromEntries(p.people.map((x) => [x.id, x]));
  assert.equal(by.a.paidThb, 300);
  assert.equal(by.a.shareThb, 145);
  assert.equal(by.b.shareThb, 145);
  assert.equal(by.c.shareThb, 100);
  const sumBal = p.people.reduce((s, x) => s + x.balance, 0);
  assert.ok(Math.abs(sumBal) < 1e-9);
  const tr = p.transfers.map((x) => `${x.from.id}>${x.to.id}:${x.thb}`).sort();
  assert.deepEqual(tr, ['b>a:55', 'c>a:100']);
});
t('people common + unassigned + removed member split', () => {
  const p = computePeople(S(), [{ thb: 50, payer: 'both' }, { thb: 70 }], [{ jpy: 400, payer: 'a', split: ['zzz'] }], 0.25);
  assert.equal(p.commonThb, 50);
  assert.deepEqual(p.unassigned, { count: 1, thb: 70 });
  // split refers only to removed member → everyone
  assert.equal(p.people.find((x) => x.id === 'c').shareThb, 100 / 3);
});
t('people shared mode no transfers', () => {
  const p = computePeople(S({ splitMode: 'shared' }), [{ thb: 300, payer: 'a' }], [], 0.25);
  assert.deepEqual(p.transfers, []);
});
t('payer of removed member counts as unassigned', () => {
  const p = computePeople(S(), [{ thb: 100, payer: 'gone' }], [], 1);
  assert.equal(p.unassigned.count, 1);
});
t('settle rounding sum', () => {
  const p = computePeople(S(), [{ thb: 100, payer: 'a' }], [], 1);
  const total = p.transfers.reduce((s, x) => s + x.thb, 0);
  assert.ok(Math.abs(total - 66.67) < 1.01, String(total));
});
t('payerName', () => {
  assert.equal(payerName('both', members, 'split'), 'กองกลาง');
  assert.equal(payerName('both', members, 'shared'), 'ร่วมกัน');
  assert.equal(payerName(undefined, members, 'split'), '');
  assert.equal(payerName('b', members, 'split'), 'บี');
});
t('sharersOf', () => {
  assert.equal(sharersOf(undefined, members).length, 3);
  assert.equal(sharersOf(['a', 'x'], members).length, 1);
});

/* ---------- invite ---------- */
t('invite round trip (Thai names)', () => {
  const trip = { id: 7, uid: 'u-1', name: 'ทริปหิมะ ❄️', country: 'JP', tripStart: '2026-03-10', days: 5, fixedRate: 0.23, rateMode: 'fixed', rateLots: [], members, splitMode: 'split', createdAt: 1 };
  const code = inviteCode(trip);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const p = decodeInvite('https://x.github.io/app/join/#t=' + code);
  assert.equal(p.trip.name, 'ทริปหิมะ ❄️');
  assert.equal(p.trip.id, undefined);
  assert.deepEqual(decodeInvite(code).trip.members, members);
});
t('invite rejects junk', () => {
  assert.equal(decodeInvite(''), null);
  assert.equal(decodeInvite('#t=abc'), null);
  assert.equal(decodeInvite('hello world'), null);
  const bad = Buffer.from(JSON.stringify({ v: 1, trip: { uid: 'x', name: 'y', members: [], country: 'US' } })).toString('base64url');
  assert.equal(decodeInvite('#t=' + bad), null);
});
t('invite rejects bad field types', () => {
  const bad = Buffer.from(JSON.stringify({ v: 1, trip: { uid: 'x', name: 'y', members: [{ id: 1 }], country: 'JP', days: 'lots' } })).toString('base64url');
  assert.equal(decodeInvite('#t=' + bad), null);
});


/* ---------- validate (ข้อมูลจากไฟล์/ลิงก์) ---------- */
const V = L('validate');
t('cleanDaily rejects bad money/day', () => {
  assert.equal(V.cleanDaily({ uid: 'x', day: 1, jpy: 'abc' }), null);
  assert.equal(V.cleanDaily({ uid: 'x', day: 0, jpy: 5 }), null);
  assert.equal(V.cleanDaily({ uid: 'x', day: 1.5, jpy: 5 }), null);
  assert.equal(V.cleanDaily({ day: 1, jpy: 5 }), null);
  const ok = V.cleanDaily({ uid: 'x', day: 2, jpy: 500, category: 'weird', receipt: 'javascript:alert(1)', payer: 'a' });
  assert.equal(ok.category, 'other');
  assert.equal(ok.receipt, undefined);
  assert.equal(ok.note, '');
});
t('cleanPlace coords/photos', () => {
  assert.equal(V.cleanPlace({ uid: 'p', day: 1, title: 'A', lat: 99, lng: 1 }), null);
  assert.equal(V.cleanPlace({ uid: 'p', day: 1, title: '', lat: 1, lng: 1 }), null);
  const p = V.cleanPlace({ uid: 'p', day: 1, title: 'A', lat: 1, lng: 2, photos: ['data:image/jpeg;base64,AAA', 'http://x'], kind: 'hotel' });
  assert.deepEqual(p.photos, ['data:image/jpeg;base64,AAA']);
  assert.equal(p.kind, 'hotel');
  assert.equal(V.cleanPlace({ uid: 'p', day: 1, title: 'A', lat: 1, lng: 2 }).photos, undefined);
  assert.deepEqual(V.cleanPlace({ uid: 'p', day: 1, title: 'A', lat: 1, lng: 2, photo: 'data:image/png;base64,B' }).photos, ['data:image/png;base64,B']);
});
t('cleanTrip', () => {
  assert.equal(V.cleanTrip({ uid: 'u', name: 'n', country: 'JP', days: 99 }), null);
  const tr = V.cleanTrip({ uid: 'u', name: 'n', country: 'CN', days: 6, tripStart: 'bad', members: [{ id: 'a', name: 'A' }, { id: 'a', name: 'dup' }, { id: '', name: 'x' }] });
  assert.equal(tr.tripStart, '');
  assert.equal(tr.members.length, 1);
  assert.equal(tr.rateMode, 'fixed');
});
t('newestByUid', () => {
  const r = V.newestByUid([{ uid: 'a', updatedAt: 1, v: 1 }, { uid: 'a', updatedAt: 5, v: 2 }, { uid: 'a', updatedAt: 3, v: 3 }, { uid: 'b', v: 4 }]);
  assert.deepEqual(r.map((x) => x.v).sort(), [2, 4]);
});

console.log(`pass ${pass} · fail ${fails.length}`);
for (const f of fails) console.log('✗ ' + f);
process.exitCode = fails.length ? 1 : 0;
