/**
 * ตั้งค่าก่อนเทสแต่ละไฟล์ - ต้องเซ็ต env ให้ครบ "ก่อน" ที่ @/lib/prisma จะถูก import
 * (จึงใช้ dynamic import แทน import ปกติที่ถูกยกขึ้นไปทำงานก่อน)
 */
import { config as loadEnv } from 'dotenv'
import { afterAll, beforeEach } from 'vitest'

loadEnv()

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://stock:stockpass@localhost:5433/stockscan_test?schema=public'
process.env.AUTH_SECRET ??= 'test-secret-at-least-32-characters-long'

const { prisma } = await import('@/lib/prisma')
const { __clearCookies } = await import('./mocks/next-headers')

/** ลำดับตารางไม่สำคัญเพราะ CASCADE แต่เขียนเรียงตามความสัมพันธ์ไว้ให้อ่านง่าย */
const TABLES = ['ScanLog', 'AuditSession', 'SerialUnit', 'Product', 'Category', 'Vendor', 'User']

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
  )
  __clearCookies()
})

afterAll(async () => {
  await prisma.$disconnect()
})
