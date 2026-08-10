/**
 * เครื่องมือช่วยเทส E2E
 *
 * แนวคิด: ข้อมูลตั้งต้นใส่ผ่าน Prisma ตรงๆ (เร็วและควบคุมได้แม่น)
 * ส่วนสิ่งที่กำลังทดสอบต้องผ่านหน้าเว็บจริงเท่านั้น - ยิงสแกนผ่านคีย์บอร์ดเสมอ
 */
import { PrismaClient } from '@prisma/client'
import { expect, test as base, type Page } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { E2E_DATABASE_URL } from './env'

/** client ของเทสผูกกับฐาน e2e ตรงๆ ไม่พึ่ง DATABASE_URL เพื่อกันเผลอไปล้างฐานใช้งานจริง */
export const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL })

const TABLES = ['ScanLog', 'AuditSession', 'SerialUnit', 'Product', 'Category', 'User']

export const ACCOUNTS = {
  // ตั้งชื่อไม่ให้ซ้ำกับ seed ของฐานใช้งานจริง ถ้าเว็บเผลอไปต่อผิดฐาน login จะพังทันที
  admin: { username: 'e2e_admin', password: 'admin123', displayName: 'แอดมินเทส' },
  staff: { username: 'e2e_staff', password: 'staff123', displayName: 'พนักงานเทส' },
} as const

export type AccountName = keyof typeof ACCOUNTS

/** ของตั้งต้นที่มีในคลังก่อนเริ่มทุกเคส */
export const STOCK = {
  notebook: ['NB-0001', 'NB-0002', 'NB-0003'],
  monitor: ['MON-0001', 'MON-0002'],
  drill: ['DRL-0001'],
} as const

export type Fixture = Awaited<ReturnType<typeof resetAndSeed>>

/** ล้างทุกตารางแล้วใส่ข้อมูลตั้งต้นชุดเดิมเป๊ะๆ ทุกครั้ง */
export async function resetAndSeed() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
  )

  const [adminHash, staffHash] = await Promise.all([
    bcrypt.hash(ACCOUNTS.admin.password, 10),
    bcrypt.hash(ACCOUNTS.staff.password, 10),
  ])
  const [admin, staff] = await Promise.all([
    prisma.user.create({
      data: {
        username: ACCOUNTS.admin.username,
        passwordHash: adminHash,
        displayName: ACCOUNTS.admin.displayName,
        role: 'ADMIN',
      },
    }),
    prisma.user.create({
      data: {
        username: ACCOUNTS.staff.username,
        passwordHash: staffHash,
        displayName: ACCOUNTS.staff.displayName,
        role: 'STAFF',
      },
    }),
  ])

  const it = await prisma.category.create({ data: { code: 'IT', name: 'อุปกรณ์ไอที' } })
  const tool = await prisma.category.create({ data: { code: 'TOOL', name: 'เครื่องมือช่าง' } })

  const notebook = await prisma.product.create({
    data: { sku: 'IT-NB-001', name: 'โน๊ตบุ๊ค', brand: 'Dell', categoryId: it.id },
  })
  const monitor = await prisma.product.create({
    data: { sku: 'IT-MON-002', name: 'จอมอนิเตอร์', brand: 'Dell', categoryId: it.id },
  })
  const drill = await prisma.product.create({
    data: { sku: 'TL-DRL-001', name: 'สว่านไร้สาย', brand: 'Makita', categoryId: tool.id },
  })

  const now = new Date()
  await prisma.serialUnit.createMany({
    data: [
      ...STOCK.notebook.map((serial) => ({ serial, productId: notebook.id })),
      ...STOCK.monitor.map((serial) => ({ serial, productId: monitor.id })),
      ...STOCK.drill.map((serial) => ({ serial, productId: drill.id })),
    ].map((u) => ({ ...u, status: 'IN_STOCK' as const, receivedAt: now })),
  })

  return {
    users: { admin, staff },
    categories: { it, tool },
    products: { notebook, monitor, drill },
  }
}

export async function countInStock(productId: string) {
  return prisma.serialUnit.count({ where: { productId, status: 'IN_STOCK' } })
}

export async function unitBySerial(serial: string) {
  return prisma.serialUnit.findUnique({ where: { serial } })
}

// ────────────────────────────── การเข้าใช้งาน ──────────────────────────────

export async function loginAs(page: Page, who: AccountName = 'staff', next?: string) {
  const account = ACCOUNTS[who]
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  await page.locator('#username').fill(account.username)
  await page.locator('#password').fill(account.password)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

/**
 * ออกจากระบบแล้วรอให้ถึงหน้า login จริงก่อนคืนค่า
 *
 * ต้องรอ เพราะบางหน้า (เช่น /users) มีช่อง #username/#password ของตัวเองอยู่ด้วย
 * ถ้ากรอกทันทีจะไปลงฟอร์มของหน้าเดิมแทนฟอร์ม login
 */
export async function logout(page: Page) {
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click()
  await page.waitForURL(/\/login/)
  await expect(page.getByTestId('login-form')).toBeVisible()
}

// ────────────────────────────── จำลองเครื่องสแกน ──────────────────────────────

/**
 * ยิงบาร์โค้ด 1 ครั้งแบบเครื่องสแกน HID จริง
 *
 * เครื่องสแกนไม่ได้ "วาง" ข้อความลงช่อง แต่ "พิมพ์" ทีละตัวอักษรเร็วมาก
 * (ระดับมิลลิวินาที) แล้วปิดท้ายด้วย Enter จึงใช้ keyboard.type ที่ delay 0
 * ไม่ใช่ fill() ซึ่งจะข้ามเหตุการณ์ keydown ทั้งหมดและไม่เหมือนของจริง
 *
 * ฟังก์ชันนี้ "ไม่รอ" ผลจากเซิร์ฟเวอร์ - คนยิงของจริงก็ไม่รอเหมือนกัน
 */
export async function scan(page: Page, serial: string) {
  await page.keyboard.type(serial, { delay: 0 })
  await page.keyboard.press('Enter')
}

/** ยิงรัวติดๆ กันหลายชิ้นโดยไม่รอผลของตัวก่อนหน้า - สถานการณ์รับของเข้าคลังจริง */
export async function scanBurst(page: Page, serials: readonly string[]) {
  await focusScanner(page)
  for (const serial of serials) await scan(page, serial)
}

/** คาโฟกัสไว้ที่ช่องสแกนก่อนเริ่มยิง (ปกติหน้าเว็บโฟกัสให้เองอยู่แล้ว) */
export async function focusScanner(page: Page) {
  const input = page.getByTestId('scan-input')
  await expect(input).toBeEnabled()
  await input.focus()
}

/** รอจนคิวส่งหมดแล้วตัวเลข รับ/ปฏิเสธ ตรงตามที่คาด */
export async function expectScanTotals(
  page: Page,
  totals: { accepted: number; rejected: number }
) {
  const counters = page.locator('[data-testid="scan-stats"] b')
  await expect(counters.nth(0)).toHaveText(String(totals.accepted))
  await expect(counters.nth(1)).toHaveText(String(totals.rejected))
  await expect(page.getByTestId('scan-pending')).toHaveCount(0)
}

/** กล่องสรุปผลของรายการที่ยิงล่าสุด */
export function lastScan(page: Page) {
  return page.getByTestId('scan-last')
}

/** แถวในตารางประวัติการยิงของรอบนี้ (ล่าสุดอยู่บนสุด) */
export function scanFeedRows(page: Page) {
  return page.locator('[data-testid="scan-feed"] tbody tr')
}

// ────────────────────────────── test ที่ล้างข้อมูลให้อัตโนมัติ ──────────────────────────────

/**
 * ใช้ `test` ตัวนี้แทนของ Playwright เพื่อให้ทุกเคสได้ฐานข้อมูลสะอาด
 * พร้อมข้อมูลตั้งต้นชุดเดียวกัน เข้าถึงผ่าน fixture ชื่อ `data`
 */
export const test = base.extend<{ data: Fixture }, { dbConnection: void }>({
  // ปิดการเชื่อมต่อฐานข้อมูลตอน worker เลิกทำงาน (ครั้งเดียว ไม่ใช่ทุกเคส)
  dbConnection: [
    async ({}, use) => {
      await use()
      await prisma.$disconnect()
    },
    { scope: 'worker', auto: true },
  ],
  data: async ({}, use) => {
    await use(await resetAndSeed())
  },
})

export { expect }
