// ตั้งค่า Next.js ให้ export เป็นไซต์สแตติก (ไม่ต้องมีเซิร์ฟเวอร์ → โฮสต์ฟรีได้)
// ถ้าจะโฮสต์ใต้ซับพาธ เช่น GitHub Pages: NEXT_PUBLIC_BASE_PATH=/ชื่อrepo npm run build
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  reactStrictMode: true,
  // typecheck ผ่านแล้ว → ให้ build ล้มถ้ามี type error (ลินต์ยังข้าม เพราะโปรเจกต์ไม่ได้ตั้ง ESLint)
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
