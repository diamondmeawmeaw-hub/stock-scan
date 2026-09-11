import { beforeEach, describe, expect, it } from 'vitest'
import { POST as qtyInRoute } from '@/app/api/quantity/in/route'
import { POST as qtyOutRoute } from '@/app/api/quantity/out/route'
import { POST as auditQtyRoute } from '@/app/api/audit/sessions/[id]/quantity/route'
import { POST as scanInRoute } from '@/app/api/scan/in/route'
import { PATCH as patchProductRoute } from '@/app/api/products/[id]/route'
import {
  auditQuantityCount,
  buildMovementReport,
  buildStockReport,
  closeAuditSession,
  openAuditSession,
  quantityIn,
  quantityOut,
} from '@/lib/scan-service'
import { dayRange, todayInThailand } from '@/lib/date-range'
import { patchJson, postJson, prisma, seedFixtures } from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>
let fx: Fixtures
let rackId: string

const qtyIn = (productId: string, quantity: unknown, extra: Record<string, unknown> = {}) =>
  postJson(qtyInRoute, { productId, quantity, ...extra })
const qtyOut = (productId: string, quantity: unknown, extra: Record<string, unknown> = {}) =>
  postJson(qtyOutRoute, { productId, quantity, reason: 'INTERNAL_USE', ...extra })

async function stockOf(productId: string) {
  return (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQty
}

describe('สินค้านับจำนวน (QUANTITY)', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
    const rack = await prisma.product.create({
      data: {
        sku: 'RK-9U-001',
        name: 'ตู้แร็ค 9U',
        categoryId: fx.categories.it.id,
        trackingType: 'QUANTITY',
        unitLabel: 'ตู้',
      },
    })
    rackId = rack.id
  })

  it('รับเข้าแบบกรอกจำนวน -> stockQty เพิ่ม และมี log serial=null', async () => {
    const res = await qtyIn(rackId, 10)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ accepted: true, quantity: 10, productInStock: 10 })

    expect(await stockOf(rackId)).toBe(10)
    const log = await prisma.scanLog.findFirst({ where: { productId: rackId, type: 'IN' } })
    expect(log).toMatchObject({ serial: null, quantity: 10, accepted: true, result: 'OK' })
  })

  it('เบิกออกแบบกรอกจำนวน -> stockQty ลด พร้อมเหตุผล', async () => {
    await qtyIn(rackId, 10)
    const res = await qtyOut(rackId, 3, { reason: 'SALE' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ accepted: true, quantity: 3, productInStock: 7 })

    expect(await stockOf(rackId)).toBe(7)
    const log = await prisma.scanLog.findFirst({ where: { productId: rackId, type: 'OUT' } })
    expect(log).toMatchObject({ serial: null, quantity: 3, reason: 'SALE', accepted: true })
  })

  it('เบิกเกินยอด -> 400 ยอดไม่เปลี่ยน (ไม่มีให้เอาออกถ้าไม่มีของ)', async () => {
    await qtyIn(rackId, 5)
    const res = await qtyOut(rackId, 6)
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('คงเหลือไม่พอ')
    expect(await stockOf(rackId)).toBe(5)
  })

  it('ของหมด (เหลือ 0) -> เบิกไม่ได้', async () => {
    const res = await qtyOut(rackId, 1)
    expect(res.status).toBe(400)
    expect(await stockOf(rackId)).toBe(0)
  })

  it('จำนวนไม่ถูกต้อง (0/ติดลบ/ทศนิยม) -> 400', async () => {
    for (const bad of [0, -2, 1.5, 'abc']) {
      const res = await qtyIn(rackId, bad)
      expect(res.status).toBe(400)
    }
    expect(await stockOf(rackId)).toBe(0)
  })

  it('ยิง serial กับสินค้านับจำนวน -> ถูกปฏิเสธให้ไปกรอกจำนวนแทน', async () => {
    const res = await postJson(scanInRoute, { serial: 'RACK0001', productId: rackId })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('กรอกจำนวน')
  })

  it('กรอกจำนวนกับสินค้ารายชิ้น -> ถูกปฏิเสธให้ไปยิง serial แทน', async () => {
    const res = await qtyIn(fx.products.notebook.id, 2)
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('ยิง serial')
  })

  it('สลับวิธีนับตอนมีของ/ประวัติแล้ว -> 409', async () => {
    await qtyIn(rackId, 2)
    const res = await patchJson(patchProductRoute, { trackingType: 'SERIAL' }, { id: rackId })
    expect(res.status).toBe(409)
  })

  it('รายงานคงเหลือรวมยอดจำนวน + รายงานเคลื่อนไหวรวม quantity', async () => {
    await qtyIn(rackId, 10)
    await qtyOut(rackId, 4, { reason: 'INTERNAL_USE' })

    const stock = await buildStockReport({})
    const rackRow = stock.categories
      .flatMap((c) => c.products)
      .find((p) => p.productId === rackId)
    expect(rackRow).toMatchObject({
      trackingType: 'QUANTITY',
      unitLabel: 'ตู้',
      inStock: 6,
      out: 4,
    })
    expect(stock.grandTotalInStock).toBeGreaterThanOrEqual(6)

    const today = todayInThailand()
    const movement = await buildMovementReport({ ...dayRange(today, today) })
    const row = movement.rows.find((r) => r.productId === rackId)
    expect(row).toMatchObject({ inCount: 10, outCount: 4 })
  })

  it('ตรวจนับ: กรอกยอดนับ + ปิดแบบปรับสต็อก -> stockQty เท่ายอดนับ', async () => {
    await qtyIn(rackId, 10)
    const session = await openAuditSession({ name: 'นับตู้แร็ค', userId: fx.user.id })

    // กรอกผ่าน service ตรงๆ (นับได้ 8 หายไป 2)
    const line = await auditQuantityCount({
      sessionId: session.id,
      productId: rackId,
      rawCounted: 8,
      userId: fx.user.id,
    })
    expect(line).toMatchObject({ expected: 10, counted: 8 })

    // กรอกผ่าน route (นับซ้ำยึดครั้งล่าสุด = 9)
    const viaRoute = await postJson(auditQtyRoute, { productId: rackId, counted: 9 }, { id: session.id })
    expect(viaRoute.status).toBe(200)

    const closed = await closeAuditSession({
      sessionId: session.id,
      userId: fx.user.id,
      applyAdjustments: true,
    })
    const qtyLine = closed.quantityLines.find((l) => l.productId === rackId)
    expect(qtyLine?.counted).toBe(9)
    expect(await stockOf(rackId)).toBe(9)
  })

  it('ยังไม่ login -> 401', async () => {
    const { __clearCookies } = await import('./mocks/next-headers')
    __clearCookies()
    const res = await qtyIn(rackId, 5)
    expect(res.status).toBe(401)
    expect(await stockOf(rackId)).toBe(0)
  })

  it('เบิกพร้อมกันสองครั้ง -> รวมกันไม่เกินยอด (ล็อกระดับสินค้า)', async () => {
    await quantityIn({ productId: rackId, rawQuantity: 10, userId: fx.user.id })
    const results = await Promise.all([
      quantityOut({ productId: rackId, rawQuantity: 7, userId: fx.user.id, reason: 'INTERNAL_USE' }).then(
        () => true,
        () => false
      ),
      quantityOut({ productId: rackId, rawQuantity: 7, userId: fx.user.id, reason: 'INTERNAL_USE' }).then(
        () => true,
        () => false
      ),
    ])
    // 7+7=14 เกิน 10 ต้องผ่านแค่ครั้งเดียว
    expect(results.filter(Boolean).length).toBe(1)
    expect(await stockOf(rackId)).toBe(3)
  })
})
