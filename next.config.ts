import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // standalone output keeps the Docker image small when this moves to the NAS
  output: 'standalone',
  // เทส E2E เปิด next dev ของตัวเองที่พอร์ตแยก ถ้าใช้ .next ร่วมกับ dev server ที่เปิดค้างไว้
  // สองตัวจะเขียนทับ chunk ของกันและกัน จนหน้าเว็บขึ้น "Loading chunk ... failed"
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // pdfkit อ่านไฟล์ .afm ของฟอนต์มาตรฐานจากดิสก์เอง ซึ่ง bundler ตาม path ไม่ทัน
  serverExternalPackages: ['pdfmake', '@foliojs-fork/pdfkit', 'exceljs'],
  outputFileTracingIncludes: {
    '/api/reports/export': ['./node_modules/@foliojs-fork/pdfkit/js/data/**'],
  },
}

export default nextConfig
