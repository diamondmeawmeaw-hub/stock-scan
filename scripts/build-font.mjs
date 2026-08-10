/**
 * สร้าง src/lib/reports/sarabun-font.ts จากฟอนต์ Sarabun บน Google Fonts
 *
 * ฝังฟอนต์เป็น base64 ในโค้ดแทนที่จะวางไฟล์ .ttf ไว้บนดิสก์ เพราะ Next.js `output: 'standalone'`
 * ใช้ @vercel/nft ซึ่ง trace path ที่ประกอบตอน runtime ไม่เจอ ไฟล์จะหายไปตอนรันใน Docker
 *
 * รันด้วย: node scripts/build-font.mjs
 */
import { writeFile } from 'node:fs/promises'

const BASE = 'https://github.com/google/fonts/raw/main/ofl/sarabun'
const OUT = new URL('../src/lib/reports/sarabun-font.ts', import.meta.url)

async function fetchBase64(file) {
  const res = await fetch(`${BASE}/${file}`)
  if (!res.ok) throw new Error(`โหลด ${file} ไม่สำเร็จ: ${res.status}`)
  return Buffer.from(await res.arrayBuffer()).toString('base64')
}

const [regular, bold] = await Promise.all([
  fetchBase64('Sarabun-Regular.ttf'),
  fetchBase64('Sarabun-Bold.ttf'),
])

await writeFile(
  OUT,
  `// สร้างโดย scripts/build-font.mjs - ห้ามแก้ด้วยมือ
// ฟอนต์ Sarabun โดย Cadson Demak, สัญญาอนุญาต SIL Open Font License 1.1
// ที่มา: https://github.com/google/fonts/tree/main/ofl/sarabun

export const SARABUN_REGULAR_BASE64 =
  '${regular}'

export const SARABUN_BOLD_BASE64 =
  '${bold}'
`,
  'utf8'
)

console.log(`เขียนฟอนต์แล้ว regular=${regular.length} bold=${bold.length} ตัวอักษร`)
