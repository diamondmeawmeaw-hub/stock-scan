import { beforeEach, describe, expect, it } from 'vitest'
import { GET as meRoute } from '@/app/api/auth/me/route'
import { POST as loginRoute } from '@/app/api/auth/login/route'
import { POST as logoutRoute } from '@/app/api/auth/logout/route'
import { POST as createProductRoute } from '@/app/api/products/route'
import { GET as movementReportRoute } from '@/app/api/reports/movement/route'
import { GET as stockReportRoute } from '@/app/api/reports/stock/route'
import { POST as scanInRoute } from '@/app/api/scan/in/route'
import { POST as scanOutRoute } from '@/app/api/scan/out/route'
import { todayInThailand } from '@/lib/date-range'
import type { buildMovementReport, buildStockReport } from '@/lib/scan-service'
import { createUser, getJson, giveStock, login, postJson, prisma, seedFixtures } from './helpers'

type StockReport = Awaited<ReturnType<typeof buildStockReport>>
type MovementReport = Awaited<ReturnType<typeof buildMovementReport>>
type Fixtures = Awaited<ReturnType<typeof seedFixtures>>

const TODAY_RANGE = { from: todayInThailand(), to: todayInThailand() }

describe('login / logout', () => {
  beforeEach(async () => {
    await createUser({ username: 'staff', password: 'staff123' })
  })

  it('รหัสถูก -> ได้ session และเรียก /me ได้', async () => {
    const res = await postJson(loginRoute, { username: 'staff', password: 'staff123' })
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ username: 'staff', role: 'STAFF' })

    const me = await getJson(meRoute)
    expect(me.status).toBe(200)
    expect(me.body.user.username).toBe('staff')
  })

  it('รหัสผิด -> 401 และไม่ได้ session', async () => {
    const res = await postJson(loginRoute, { username: 'staff', password: 'ผิด' })
    expect(res.status).toBe(401)
    expect((await getJson(meRoute)).body.user).toBeNull()
  })

  it('ชื่อผู้ใช้ไม่สนใจตัวพิมพ์เล็กใหญ่และช่องว่างหัวท้าย', async () => {
    const res = await postJson(loginRoute, { username: '  STAFF ', password: 'staff123' })
    expect(res.status).toBe(200)
  })

  it('ผู้ใช้ที่ถูกปิดการใช้งาน -> login ไม่ได้', async () => {
    await prisma.user.update({ where: { username: 'staff' }, data: { active: false } })
    const res = await postJson(loginRoute, { username: 'staff', password: 'staff123' })
    expect(res.status).toBe(401)
  })

  it('logout -> ใช้ session เดิมต่อไม่ได้', async () => {
    await login('staff', 'staff123')
    expect((await postJson(logoutRoute)).status).toBe(200)
    expect((await getJson(meRoute)).body.user).toBeNull()
  })
})

describe('สิทธิ์ผู้ใช้', () => {
  let fx: Fixtures

  beforeEach(async () => {
    fx = await seedFixtures() // login เป็น staff ไว้แล้ว
  })

  it('staff เพิ่มสินค้าได้', async () => {
    const res = await postJson(createProductRoute, {
      sku: 'IT-NEW-999',
      name: 'ของใหม่',
      categoryId: fx.categories.it.id,
    })
    expect(res.status).toBe(200)
    expect(await prisma.product.count({ where: { sku: 'IT-NEW-999' } })).toBe(1)
  })

  it('admin เพิ่มสินค้าได้ และ SKU ถูกทำเป็นตัวพิมพ์ใหญ่', async () => {
    await login('admin', 'admin123')
    const res = await postJson(createProductRoute, {
      sku: 'it-new-999',
      name: 'ของใหม่',
      categoryId: fx.categories.it.id,
    })
    expect(res.status).toBe(200)
    expect(res.body.product.sku).toBe('IT-NEW-999')
  })

  it('SKU ซ้ำ -> 409', async () => {
    await login('admin', 'admin123')
    const body = { sku: 'IT-NB-001', name: 'ซ้ำ', categoryId: fx.categories.it.id }
    expect((await postJson(createProductRoute, body)).status).toBe(409)
  })
})

describe('GET /api/reports/stock', () => {
  let fx: Fixtures

  beforeEach(async () => {
    fx = await seedFixtures()
  })

  it('ยังไม่ login -> 401', async () => {
    const { __clearCookies } = await import('./mocks/next-headers')
    __clearCookies()
    expect((await getJson(stockReportRoute)).status).toBe(401)
  })

  it('รวมยอดคงเหลือแยกตามหมวดหมู่ และไม่นับของที่เบิกออกไปแล้ว', async () => {
    await giveStock(fx.products.notebook.id, ['NB0001', 'NB0002', 'NB0003'])
    await giveStock(fx.products.monitor.id, ['MON0001'])
    await giveStock(fx.products.drill.id, ['DRL0001', 'DRL0002'])
    await postJson(scanOutRoute, { serial: 'NB0003', reason: 'SALE' })

    const { status, body } = await getJson<StockReport>(stockReportRoute)
    expect(status).toBe(200)

    const it = body.categories.find((c) => c.categoryCode === 'IT')!
    const tool = body.categories.find((c) => c.categoryCode === 'TOOL')!

    expect(it.totalInStock).toBe(3) // โน๊ตบุ๊ค 2 + จอ 1
    expect(tool.totalInStock).toBe(2)
    expect(body.grandTotalInStock).toBe(5)

    const notebook = it.products.find((p) => p.sku === 'IT-NB-001')!
    expect(notebook).toMatchObject({ inStock: 2, out: 1 })
  })

  it('ประเภทที่ยังไม่มีของ -> ยังขึ้นในรายงานด้วยยอด 0', async () => {
    const { body } = await getJson<StockReport>(stockReportRoute)
    expect(body.categories.length).toBe(2)
    expect(body.grandTotalInStock).toBe(0)
    expect(body.categories.every((c) => c.totalInStock === 0)).toBe(true)
  })

  it('กรองตามประเภทของ -> เห็นแค่ประเภทนั้น และยอดรวมคิดแค่ที่กรองไว้', async () => {
    await giveStock(fx.products.notebook.id, ['NB0001', 'NB0002'])
    await giveStock(fx.products.drill.id, ['DRL0001'])

    const { body } = await getJson<StockReport>(stockReportRoute, undefined, {
      categoryId: fx.categories.it.id,
    })
    expect(body.categories.map((c) => c.categoryCode)).toEqual(['IT'])
    expect(body.grandTotalInStock).toBe(2)
  })

  it('กรองตามแบรนด์ -> เห็นแค่สินค้าของแบรนด์นั้น', async () => {
    await giveStock(fx.products.notebook.id, ['NB0001'])
    await giveStock(fx.products.drill.id, ['DRL0001', 'DRL0002'])

    const { body } = await getJson<StockReport>(stockReportRoute, undefined, { brand: 'Makita' })
    expect(body.categories.map((c) => c.categoryCode)).toEqual(['TOOL'])
    expect(body.categories[0].products.map((p) => p.sku)).toEqual(['TL-DRL-001'])
    expect(body.grandTotalInStock).toBe(2)
  })

  it('ค้นหาจับได้ทั้งชื่อสินค้า SKU และแบรนด์ แบบไม่สนตัวพิมพ์เล็กใหญ่', async () => {
    await giveStock(fx.products.notebook.id, ['NB0001'])
    await giveStock(fx.products.monitor.id, ['MON0001'])
    await giveStock(fx.products.drill.id, ['DRL0001'])

    const byBrand = await getJson<StockReport>(stockReportRoute, undefined, { q: 'dell' })
    expect(byBrand.body.categories.flatMap((c) => c.products).map((p) => p.sku).sort()).toEqual([
      'IT-MON-002',
      'IT-NB-001',
    ])

    const bySku = await getJson<StockReport>(stockReportRoute, undefined, { q: 'tl-drl' })
    expect(bySku.body.categories.flatMap((c) => c.products).map((p) => p.sku)).toEqual([
      'TL-DRL-001',
    ])

    const byName = await getJson<StockReport>(stockReportRoute, undefined, { q: 'สว่าน' })
    expect(byName.body.categories.flatMap((c) => c.products).map((p) => p.sku)).toEqual([
      'TL-DRL-001',
    ])
  })

  it('กรองแล้วไม่เจออะไร -> ไม่มีประเภทค้างให้รกจอ', async () => {
    const { body } = await getJson<StockReport>(stockReportRoute, undefined, { q: 'ไม่มีของนี้' })
    expect(body.categories).toEqual([])
    expect(body.grandTotalInStock).toBe(0)
  })
})

describe('GET /api/reports/movement', () => {
  let fx: Fixtures

  beforeEach(async () => {
    fx = await seedFixtures()
  })

  /** ย้อนวันที่ของ ScanLog เพื่อจำลองว่ายิงไปเมื่อวันก่อน */
  async function backdateScans(serial: string, isoDate: string) {
    await prisma.scanLog.updateMany({
      where: { serial },
      data: { createdAt: new Date(`${isoDate}T10:00:00+07:00`) },
    })
  }

  it('ยังไม่ login -> 401', async () => {
    const { __clearCookies } = await import('./mocks/next-headers')
    __clearCookies()
    const res = await getJson(movementReportRoute, undefined, TODAY_RANGE)
    expect(res.status).toBe(401)
  })

  it('ไม่ส่งช่วงวันที่ -> 400', async () => {
    expect((await getJson(movementReportRoute)).status).toBe(400)
  })

  it('นับรับเข้า/เบิกออกในช่วงวันที่ที่เลือก แยกตามสินค้า', async () => {
    await postJson(scanInRoute, { serial: 'NB0001', productId: fx.products.notebook.id })
    await postJson(scanInRoute, { serial: 'NB0002', productId: fx.products.notebook.id })
    await postJson(scanOutRoute, { serial: 'NB0001', reason: 'SALE' })
    await postJson(scanInRoute, { serial: 'DRL0001', productId: fx.products.drill.id })

    const { status, body } = await getJson<MovementReport>(
      movementReportRoute,
      undefined,
      TODAY_RANGE
    )
    expect(status).toBe(200)
    expect(body.totalIn).toBe(3)
    expect(body.totalOut).toBe(1)

    const notebook = body.rows.find((r) => r.sku === 'IT-NB-001')!
    expect(notebook).toMatchObject({ inCount: 2, outCount: 1, brand: 'Dell' })
    expect(body.rows.find((r) => r.sku === 'TL-DRL-001')).toMatchObject({
      inCount: 1,
      outCount: 0,
    })
  })

  it('ของที่ยิงนอกช่วงวันที่ -> ไม่ถูกนับ', async () => {
    await postJson(scanInRoute, { serial: 'NB0001', productId: fx.products.notebook.id })
    await backdateScans('NB0001', '2026-01-15')
    await postJson(scanInRoute, { serial: 'NB0002', productId: fx.products.notebook.id })

    const inJanuary = await getJson<MovementReport>(movementReportRoute, undefined, {
      from: '2026-01-01',
      to: '2026-01-31',
    })
    expect(inJanuary.body.totalIn).toBe(1)

    const today = await getJson<MovementReport>(movementReportRoute, undefined, TODAY_RANGE)
    expect(today.body.totalIn).toBe(1)
  })

  it('การสแกนที่ถูกปฏิเสธ -> ไม่ทำให้ยอดขยับ', async () => {
    await postJson(scanInRoute, { serial: 'NB0001', productId: fx.products.notebook.id })
    await postJson(scanInRoute, { serial: 'NB0001', productId: fx.products.notebook.id }) // ซ้ำ
    await postJson(scanOutRoute, { serial: 'ไม่มีจริง', reason: 'SALE' })

    const { body } = await getJson<MovementReport>(movementReportRoute, undefined, TODAY_RANGE)
    expect(body.totalIn).toBe(1)
    expect(body.totalOut).toBe(0)
  })

  it('ตัวกรองแบรนด์และประเภทของใช้กับรายงานความเคลื่อนไหวได้ด้วย', async () => {
    await postJson(scanInRoute, { serial: 'NB0001', productId: fx.products.notebook.id })
    await postJson(scanInRoute, { serial: 'DRL0001', productId: fx.products.drill.id })

    const byBrand = await getJson<MovementReport>(movementReportRoute, undefined, {
      ...TODAY_RANGE,
      brand: 'Makita',
    })
    expect(byBrand.body.rows.map((r) => r.sku)).toEqual(['TL-DRL-001'])

    const byCategory = await getJson<MovementReport>(movementReportRoute, undefined, {
      ...TODAY_RANGE,
      categoryId: fx.categories.it.id,
    })
    expect(byCategory.body.rows.map((r) => r.sku)).toEqual(['IT-NB-001'])
  })
})
