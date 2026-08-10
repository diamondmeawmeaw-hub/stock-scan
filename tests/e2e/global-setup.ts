/**
 * เตรียมฐานข้อมูลสำหรับ E2E - รันครั้งเดียวก่อนเปิดเว็บเซิร์ฟเวอร์เทส
 * 1) สร้างฐาน stockscan_e2e ถ้ายังไม่มี
 * 2) ลง migration ล่าสุด
 *
 * ข้อมูลตั้งต้นไม่ได้ใส่ที่นี่ - แต่ละเทสล้างแล้ว seed เองใน fixtures.ts
 * เพื่อให้ทุกเคสเริ่มจากสถานะเดียวกันไม่ว่าจะรันเดี่ยวหรือรันทั้งชุด
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { E2E_BASE_URL, E2E_DATABASE_URL } from './env'

function parseDbName(url: string): { adminUrl: string; dbName: string } {
  const parsed = new URL(url)
  const dbName = parsed.pathname.replace(/^\//, '')
  if (!dbName) throw new Error('E2E_DATABASE_URL ไม่ได้ระบุชื่อฐานข้อมูล')
  // ต่อเข้า postgres (ฐานระบบ) เพื่อสั่งสร้างฐานข้อมูลเทส
  parsed.pathname = '/postgres'
  parsed.search = ''
  return { adminUrl: parsed.toString(), dbName }
}

async function ensureDatabase() {
  const { adminUrl, dbName } = parseDbName(E2E_DATABASE_URL)
  const { PrismaClient } = await import('@prisma/client')
  const admin = new PrismaClient({ datasourceUrl: adminUrl })
  try {
    const rows = await admin.$queryRawUnsafe<{ datname: string }[]>(
      'SELECT datname FROM pg_database WHERE datname = $1',
      dbName
    )
    if (rows.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
      console.log(`[e2e] สร้างฐานข้อมูล "${dbName}" แล้ว`)
    }
  } catch (err) {
    throw new Error(
      `ต่อฐานข้อมูล E2E ไม่ได้ (${adminUrl}) - สั่ง \`docker compose up -d db\` ก่อนรันเทส\n${
        err instanceof Error ? err.message : String(err)
      }`
    )
  } finally {
    await admin.$disconnect()
  }
}

/**
 * ยิงหน้าและ API หลักให้ dev server คอมไพล์ไว้ก่อน
 *
 * Playwright เปิดเว็บเซิร์ฟเวอร์ก่อน globalSetup - เคสแรกของชุดจึงเป็นคนจ่ายค่าคอมไพล์
 * ครั้งแรกทั้งหมด ซึ่งบางครั้งเกิน navigationTimeout 30 วิ แล้วล้มแบบไม่เกี่ยวกับของที่เทส
 */
async function warmUpRoutes() {
  const paths = [
    '/login',
    '/',
    '/scan-in',
    '/scan-out',
    '/audit',
    '/serials',
    '/reports',
    '/products',
    '/categories',
    '/vendors',
    '/users',
  ]
  await Promise.all(paths.map((p) => fetch(`${E2E_BASE_URL}${p}`).catch(() => {})))
  // ยิง login ด้วยรหัสผิด - ได้ 401 แต่ route ถูกคอมไพล์แล้ว (bcrypt/prisma โหลดเสร็จ)
  await fetch(`${E2E_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: '__warmup__', password: '__warmup__' }),
  }).catch(() => {})
}

export default async function globalSetup() {
  await ensureDatabase()
  // เรียกไฟล์ CLI ของ prisma ด้วย node ตรงๆ - ข้ามปัญหา .cmd/shell บน Windows
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js')
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'inherit',
  })
  await warmUpRoutes()
}
