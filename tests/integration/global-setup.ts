/**
 * เตรียมฐานข้อมูลสำหรับ integration test - รันครั้งเดียวก่อนเทสทุกไฟล์
 * 1) สร้างฐานข้อมูลเทสถ้ายังไม่มี
 * 2) ลง migration ล่าสุด
 *
 * ฐานข้อมูลเทสแยกจากฐานข้อมูลใช้งานจริงเสมอ เพราะทุกเทสจะล้างตารางทิ้ง
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { config as loadEnv } from 'dotenv'

loadEnv()

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://stock:stockpass@localhost:5433/stockscan_test?schema=public'

function parseDbName(url: string): { adminUrl: string; dbName: string } {
  const parsed = new URL(url)
  const dbName = parsed.pathname.replace(/^\//, '')
  if (!dbName) throw new Error('TEST_DATABASE_URL ไม่ได้ระบุชื่อฐานข้อมูล')
  // ต่อเข้า postgres (ฐานระบบ) เพื่อสั่งสร้างฐานข้อมูลเทส
  parsed.pathname = '/postgres'
  parsed.search = ''
  return { adminUrl: parsed.toString(), dbName }
}

async function ensureDatabase() {
  const { adminUrl, dbName } = parseDbName(TEST_DATABASE_URL)
  const { PrismaClient } = await import('@prisma/client')
  const admin = new PrismaClient({ datasourceUrl: adminUrl })
  try {
    const rows = await admin.$queryRawUnsafe<{ datname: string }[]>(
      'SELECT datname FROM pg_database WHERE datname = $1',
      dbName
    )
    if (rows.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
      console.log(`[integration] สร้างฐานข้อมูลเทส "${dbName}" แล้ว`)
    }
  } catch (err) {
    throw new Error(
      `ต่อฐานข้อมูลเทสไม่ได้ (${adminUrl}) - สั่ง \`docker compose up -d db\` ก่อนรันเทส\n${
        err instanceof Error ? err.message : String(err)
      }`
    )
  } finally {
    await admin.$disconnect()
  }
}

export async function setup() {
  await ensureDatabase()
  // เรียกไฟล์ CLI ของ prisma ด้วย node ตรงๆ - ข้ามปัญหา .cmd/shell บน Windows
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js')
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  })
}
