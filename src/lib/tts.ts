// อ่านออกเสียงด้วย Web Speech API ของเบราว์เซอร์ (ฟรี ไม่ใช้เน็ต) — ภาษาตามประเทศของทริป (ja-JP / zh-CN)

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const want = lang.toLowerCase();
  const voices = window.speechSynthesis.getVoices();
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  return voices.find((v) => norm(v) === want) ?? voices.find((v) => norm(v).startsWith(want.slice(0, 2)));
}

/** true = มีเสียงภาษานั้นในเครื่อง (บางเครื่อง/เบราว์เซอร์โหลดรายการเสียงช้า ให้เรียกซ้ำภายหลังได้) */
export function hasVoice(lang: string): boolean {
  return ttsSupported() && !!voiceFor(lang);
}

export function speak(text: string, lang: string, rate = 0.85): boolean {
  if (!ttsSupported() || !text.trim()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  const v = voiceFor(lang);
  if (v) u.voice = v;
  synth.speak(u);
  return true;
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
