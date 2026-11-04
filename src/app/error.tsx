'use client';
// หน้าจอกันแอปค้างเป็นจอขาว: ถ้าหน้าใดพัง (ข้อมูลแปลก/โหลดไฟล์ไม่ครบ) ให้ลองใหม่หรือโหลดแอปใหม่ได้ ข้อมูลในเครื่องไม่หาย
import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="px-6 pt-[calc(env(safe-area-inset-top)+64px)] text-center">
      <div className="text-5xl">😵</div>
      <h1 className="mt-3 text-[22px] font-bold">หน้านี้มีปัญหา</h1>
      <p className="mt-2 text-[15px] text-ios-secondary">ข้อมูลของคุณยังอยู่ครบในเครื่อง ลองใหม่อีกครั้ง หรือโหลดแอปใหม่</p>
      <div className="mx-auto mt-5 grid max-w-xs gap-2">
        <button className="btn-primary !py-3" onClick={reset}>
          ลองใหม่
        </button>
        <button className="btn-ghost !py-3" onClick={() => window.location.reload()}>
          โหลดแอปใหม่
        </button>
      </div>
      <p className="mt-6 break-words text-[11px] text-ios-tertiary">{error?.message}</p>
    </div>
  );
}
