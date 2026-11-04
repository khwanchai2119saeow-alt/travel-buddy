'use client';
// กรณีโครงหลักของแอปพัง (เกิดน้อยมาก) — หน้าสำรองแบบไม่พึ่ง CSS ของแอป
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="th">
      <body style={{ fontFamily: '-apple-system, system-ui, sans-serif', textAlign: 'center', padding: '80px 24px', background: '#f2f2f7', color: '#000' }}>
        <div style={{ fontSize: 48 }}>😵</div>
        <h1 style={{ fontSize: 22 }}>แอปมีปัญหา</h1>
        <p style={{ color: '#8e8e93' }}>ข้อมูลของคุณยังอยู่ครบในเครื่อง</p>
        <button onClick={reset} style={{ marginTop: 16, padding: '12px 24px', borderRadius: 12, border: 0, background: '#007aff', color: '#fff', fontSize: 17 }}>
          ลองใหม่
        </button>
        <br />
        <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: '12px 24px', borderRadius: 12, border: 0, background: 'transparent', color: '#007aff', fontSize: 17 }}>
          โหลดแอปใหม่
        </button>
      </body>
    </html>
  );
}
