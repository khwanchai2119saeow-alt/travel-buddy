import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="px-6 pt-[calc(env(safe-area-inset-top)+64px)] text-center">
      <div className="text-5xl">🧭</div>
      <h1 className="mt-3 text-[22px] font-bold">ไม่พบหน้านี้</h1>
      <p className="mt-2 text-[15px] text-ios-secondary">ลิงก์อาจไม่ครบหรือหน้าถูกย้ายไปแล้ว</p>
      <Link href="/" className="btn-primary mx-auto mt-5 max-w-xs !py-3">
        กลับหน้าแรก
      </Link>
    </div>
  );
}
