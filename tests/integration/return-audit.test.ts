import { beforeEach, describe, expect, it } from 'vitest'
import { POST as returnRoute } from '@/app/api/scan/return/route'
import { POST as scanOutRoute } from '@/app/api/scan/out/route'
import { POST as qtyOutRoute } from '@/app/api/quantity/out/route'
import { DELETE as deleteAuditRoute } from '@/app/api/audit/sessions/[id]/route'
import type { ScanOutcome } from '@/lib/scan-service'
import { giveStock, postJson, prisma, seedFixtures } from './helpers'
import { buildOutReport, openAuditSession, quantityIn } from '@/lib/scan-service'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>
let fx: Fixtures
let rackId: string

describe('POST /api/scan/return (คืนของที่เบิกผิด)', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
    await giveStock(fx.products.notebook.id, ['NB0001', 'NB0002'])
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

  async function scanOutNotebook(serial: string) {
    const res = await postJson<ScanOutcome>(scanOutRoute, { serial, reason: 'SALE' })
    expect(res.status).toBe(200)
    return res.body.scanLogId!
  }

  it('เบิกรายชิ้นแล้วคืน -> กลับ IN_STOCK พร้อม log ผูกกัน', async () => {
    const outLogId = await scanOutNotebook('NB0001')

    const res = await postJson<ScanOutcome>(returnRoute, { scanLogId: outLogId })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ accepted: true, result: 'RETURNED', serial: 'NB0001' })

    expect((await prisma.serialUnit.findUniqueOrThrow({ where: { serial: 'NB0001' } })).status).toBe(
      'IN_STOCK'
    )
    const backLog = await prisma.scanLog.findFirstOrThrow({
      where: { reversesId: outLogId },
    })
    expect(backLog).toMatchObject({ type: 'IN', result: 'RETURNED', accepted: true })

    // เบิกออกได้อีกรอบหลังคืน
    const again = await postJson<ScanOutcome>(scanOutRoute, { serial: 'NB0001', reason: 'SALE' })
    expect(again.body.accepted).toBe(true)
  })

  it('คืนซ้ำรายการเดิม -> 409', async () => {
    const outLogId = await scanOutNotebook('NB0001')
    expect((await postJson(returnRoute, { scanLogId: outLogId })).status).toBe(200)

    const res = await postJson(returnRoute, { scanLogId: outLogId })
    expect(res.status).toBe(409)
    expect(res.body.error).toContain('คืนเข้าคลังไปแล้ว')
  })

  it('คืน log ที่ไม่ใช่เบิกออก (รับเข้า/ปฏิเสธ) -> 400', async () => {
    const inLog = await prisma.scanLog.create({
      data: {
        serial: 'NB0001',
        type: 'IN',
        result: 'CREATED',
        accepted: true,
        userId: fx.user.id,
        productId: fx.products.notebook.id,
      },
    })
    const res = await postJson(returnRoute, { scanLogId: inLog.id })
    expect(res.status).toBe(400)
  })

  it('เบิกแบบจำนวนแล้วคืน -> stockQty กลับเท่าเดิม', async () => {
    await quantityIn({ productId: rackId, rawQuantity: 10, userId: fx.user.id })
    const outRes = await postJson<{ scanLogId: string }>(qtyOutRoute, {
      productId: rackId,
      quantity: 4,
      reason: 'INTERNAL_USE',
    })
    expect(outRes.status).toBe(200)
    expect(await stockOf()).toBe(6)

    const res = await postJson<ScanOutcome>(returnRoute, { scanLogId: outRes.body.scanLogId })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ accepted: true, result: 'RETURNED', productInStock: 10 })
    expect(await stockOf()).toBe(10)

    // คืนซ้ำ -> 409 ยอดไม่บวม
    expect((await postJson(returnRoute, { scanLogId: outRes.body.scanLogId })).status).toBe(409)
    expect(await stockOf()).toBe(10)
  })

  it('ยังไม่ login -> 401', async () => {
    const outLogId = await scanOutNotebook('NB0001')
    const { __clearCookies } = await import('./mocks/next-headers')
    __clearCookies()
    expect((await postJson(returnRoute, { scanLogId: outLogId })).status).toBe(401)
  })

  it('ยิงเบิกชิ้นเดิมซ้ำ -> บอกว่าเบิกไปเมื่อไหร่ให้ใคร', async () => {
    await scanOutNotebook('NB0001')
    const res = await postJson<ScanOutcome>(scanOutRoute, { serial: 'NB0001', reason: 'SALE' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ accepted: false, result: 'ALREADY_OUT' })
    // ข้อความต้องบอกที่มา ไม่ใช่แค่ "เบิกออกไปแล้ว" ลอยๆ
    expect(res.body.message).toContain('เบิกไปเมื่อ')
  })

  it('คืนของนับจำนวน -> ยอดเบิกสะสมในรายงานกลับเท่าเดิม', async () => {
    await quantityIn({ productId: rackId, rawQuantity: 10, userId: fx.user.id })
    const outRes = await postJson<{ scanLogId: string }>(qtyOutRoute, {
      productId: rackId,
      quantity: 4,
      reason: 'INTERNAL_USE',
    })
    expect((await buildOutReport({})).grandTotalOut).toBe(4)

    expect((await postJson(returnRoute, { scanLogId: outRes.body.scanLogId })).status).toBe(200)
    // เบิก 4 คืน 4 = ยอดเบิกสะสมต้องกลับเป็น 0 ไม่ค้าง
    expect((await buildOutReport({})).grandTotalOut).toBe(0)
  })

  it('คืนของรายชิ้น -> ยอดเบิกสะสมในรายงานกลับเท่าเดิม', async () => {
    const outLogId = await scanOutNotebook('NB0001')
    expect((await buildOutReport({})).grandTotalOut).toBe(1)

    expect((await postJson(returnRoute, { scanLogId: outLogId })).status).toBe(200)
    expect((await buildOutReport({})).grandTotalOut).toBe(0)
  })

  async function stockOf() {
    return (await prisma.product.findUniqueOrThrow({ where: { id: rackId } })).stockQty
  }
})

describe('DELETE /api/audit/sessions/[id] (ลบรอบที่เปิดผิด)', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
  })

  it('รอบว่าง -> ลบได้', async () => {
    const session = await openAuditSession({ name: 'เปิดผิด', userId: fx.user.id })
    const res = await postJson(deleteAuditRoute, undefined, { id: session.id })
    expect(res.status).toBe(200)
    expect(await prisma.auditSession.findUnique({ where: { id: session.id } })).toBeNull()
  })

  it('รอบที่เริ่มนับแล้ว -> 409', async () => {
    const session = await openAuditSession({ name: 'นับไปแล้ว', userId: fx.user.id })
    await giveStock(fx.products.notebook.id, ['NB0001'])
    const { auditScan } = await import('@/lib/scan-service')
    await auditScan({ sessionId: session.id, rawSerial: 'NB0001', userId: fx.user.id })

    const res = await postJson(deleteAuditRoute, undefined, { id: session.id })
    expect(res.status).toBe(409)
  })

  it('รอบที่ปิดแล้ว -> 409', async () => {
    const session = await openAuditSession({ name: 'ปิดแล้ว', userId: fx.user.id })
    const { closeAuditSession } = await import('@/lib/scan-service')
    await closeAuditSession({ sessionId: session.id, userId: fx.user.id, applyAdjustments: false })

    const res = await postJson(deleteAuditRoute, undefined, { id: session.id })
    expect(res.status).toBe(409)
  })
})
