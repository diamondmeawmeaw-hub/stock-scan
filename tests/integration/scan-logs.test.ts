import { beforeEach, describe, expect, it } from 'vitest'
import { GET as scanLogsRoute } from '@/app/api/scan-logs/route'
import { POST as scanInRoute } from '@/app/api/scan/in/route'
import { POST as scanOutRoute } from '@/app/api/scan/out/route'
import { todayInThailand } from '@/lib/date-range'
import type { ScanLogPage } from '@/lib/scan-service'
import { getJson, login, postJson, prisma, seedFixtures } from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>
let fx: Fixtures

const TODAY = todayInThailand()

const list = (query: Record<string, string> = {}) =>
  getJson<ScanLogPage>(scanLogsRoute, {}, query)

const scanIn = (serial: string, productId: string) => postJson(scanInRoute, { serial, productId })
const scanOut = (serial: string, reason = 'SALE') => postJson(scanOutRoute, { serial, reason })

describe('GET /api/scan-logs', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
  })

  it('ยังไม่ login -> 401', async () => {
    const { __clearCookies } = await import('./mocks/next-headers')
    __clearCookies()

    expect((await list()).status).toBe(401)
  })

  it('ไม่ใส่ตัวกรอง -> เห็นทุกรายการ เรียงจากใหม่ไปเก่า', async () => {
    await scanIn('NB0001', fx.products.notebook.id)
    await scanOut('NB0001')

    const { status, body } = await list()

    expect(status).toBe(200)
    expect(body.total).toBe(2)
    expect(body.rows.map((r) => r.type)).toEqual(['OUT', 'IN'])
    expect(body.rows[0]).toMatchObject({ serial: 'NB0001', result: 'OK', userName: 'staff' })
  })

  it('กรองตามประเภท -> เห็นเฉพาะประเภทนั้น', async () => {
    await scanIn('NB0001', fx.products.notebook.id)
    await scanIn('NB0002', fx.products.notebook.id)
    await scanOut('NB0001')

    const onlyIn = await list({ type: 'IN' })
    expect(onlyIn.body.total).toBe(2)
    expect(onlyIn.body.rows.every((r) => r.type === 'IN')).toBe(true)

    const onlyOut = await list({ type: 'OUT' })
    expect(onlyOut.body.total).toBe(1)
    expect(onlyOut.body.rows[0].serial).toBe('NB0001')
  })

  it('กรองตาม serial บางส่วน -> เจอทุกตัวที่มีคำนั้นอยู่', async () => {
    await scanIn('NB0001', fx.products.notebook.id)
    await scanIn('DR0001', fx.products.drill.id)

    const { body } = await list({ q: 'nb' })

    expect(body.total).toBe(1)
    expect(body.rows[0].serial).toBe('NB0001')
  })

  it('กรองตามผู้สแกน -> เห็นเฉพาะของคนนั้น', async () => {
    await scanIn('NB0001', fx.products.notebook.id)

    // สลับไป login เป็น admin แล้วยิงอีกครั้ง เพื่อให้มี log ของสองคน
    await login(fx.admin.username, fx.admin.password)
    await scanIn('NB0002', fx.products.notebook.id)

    const mine = await list({ userId: fx.admin.id })
    expect(mine.body.total).toBe(1)
    expect(mine.body.rows[0]).toMatchObject({ serial: 'NB0002', userName: 'admin' })

    const theirs = await list({ userId: fx.user.id })
    expect(theirs.body.total).toBe(1)
    expect(theirs.body.rows[0].serial).toBe('NB0001')
  })

  it('กรองช่วงวันที่ -> วันนี้เจอ ช่วงในอดีตไม่เจอ', async () => {
    await scanIn('NB0001', fx.products.notebook.id)

    expect((await list({ from: TODAY, to: TODAY })).body.total).toBe(1)
    expect((await list({ from: '2020-01-01', to: '2020-01-31' })).body.total).toBe(0)
  })

  it('ใส่วันเริ่มต้นอย่างเดียว -> ยังกรองได้ (ถือว่าเป็นวันนั้นวันเดียว)', async () => {
    await scanIn('NB0001', fx.products.notebook.id)

    expect((await list({ from: TODAY })).body.total).toBe(1)
    expect((await list({ to: '2020-01-01' })).body.total).toBe(0)
  })

  it('แบ่งหน้าละ 50 -> หน้าแรกเต็ม 50 หน้าสองได้ที่เหลือ ไม่ซ้ำกัน', async () => {
    const serials = Array.from({ length: 60 }, (_, i) => `BULK${String(i).padStart(4, '0')}`)
    await prisma.scanLog.createMany({
      data: serials.map((serial, i) => ({
        serial,
        type: 'IN' as const,
        result: 'CREATED' as const,
        accepted: true,
        userId: fx.user.id,
        productId: fx.products.notebook.id,
        createdAt: new Date(Date.now() + i * 1000),
      })),
    })

    const page1 = await list()
    expect(page1.body).toMatchObject({ total: 60, page: 1, pageSize: 50, totalPages: 2 })
    expect(page1.body.rows).toHaveLength(50)

    const page2 = await list({ page: '2' })
    expect(page2.body.page).toBe(2)
    expect(page2.body.rows).toHaveLength(10)

    const ids = new Set([...page1.body.rows, ...page2.body.rows].map((r) => r.id))
    expect(ids.size).toBe(60)
    // เรียงใหม่ไปเก่า -> ตัวที่สร้างท้ายสุดต้องอยู่บนสุดของหน้าแรก
    expect(page1.body.rows[0].serial).toBe('BULK0059')
  })

  it('ขอหน้าที่เกินจำนวนจริง -> ถอยมาหน้าสุดท้ายแทนตารางเปล่า', async () => {
    await scanIn('NB0001', fx.products.notebook.id)

    const { body } = await list({ page: '99' })

    expect(body.page).toBe(1)
    expect(body.rows).toHaveLength(1)
  })

  it('เก็บรายการที่ระบบปฏิเสธไว้ด้วย', async () => {
    await scanOut('NEVERSEEN') // ยิงเบิกออกของที่ไม่มีในระบบ

    const { body } = await list()

    expect(body.rows[0]).toMatchObject({ result: 'UNKNOWN_SERIAL', accepted: false })
  })

  it('ไม่มีรายการตรงตัวกรอง -> total 0 แต่ยังตอบ 200', async () => {
    const { status, body } = await list({ q: 'ไม่มีจริง' })

    expect(status).toBe(200)
    expect(body).toMatchObject({ total: 0, page: 1, totalPages: 1 })
    expect(body.rows).toEqual([])
  })

  it('ค่าตัวกรองไม่ถูกต้อง -> 400', async () => {
    expect((await list({ type: 'มั่ว' })).status).toBe(400)
    expect((await list({ from: '6 สิงหา' })).status).toBe(400)
    expect((await list({ page: '0' })).status).toBe(400)
  })

  it('วันเริ่มต้นเกินวันสิ้นสุด -> 400', async () => {
    expect((await list({ from: TODAY, to: '2020-01-01' })).status).toBe(400)
  })
})
