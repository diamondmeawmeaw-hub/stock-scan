import { beforeEach, describe, expect, it } from 'vitest'
import { POST as scanInRoute } from '@/app/api/scan/in/route'
import type { ScanOutcome } from '@/lib/scan-service'
import { giveStock, postJson, prisma, seedFixtures, unitBySerial } from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>
let fx: Fixtures

const scanIn = (serial: string, productId: string, note?: string) =>
  postJson<ScanOutcome>(scanInRoute, { serial, productId, note })

describe('POST /api/scan/in', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
  })

  it('ยังไม่ login -> 401 และไม่แตะฐานข้อมูล', async () => {
    const { __clearCookies } = await import('./mocks/next-headers')
    __clearCookies()

    const res = await scanIn('NB0001', fx.products.notebook.id)
    expect(res.status).toBe(401)
    expect(await prisma.serialUnit.count()).toBe(0)
  })

  it('serial ใหม่ -> สร้างชิ้นงานเข้าคลัง พร้อมบันทึก log', async () => {
    const res = await scanIn('NB0001', fx.products.notebook.id)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ accepted: true, result: 'CREATED', serial: 'NB0001' })
    expect(res.body.product?.sku).toBe('IT-NB-001')
    expect(res.body.productInStock).toBe(1)

    const unit = await unitBySerial('NB0001')
    expect(unit).toMatchObject({ status: 'IN_STOCK', productId: fx.products.notebook.id })
    expect(unit?.receivedAt).toBeInstanceOf(Date)

    const log = await prisma.scanLog.findFirst({ where: { serial: 'NB0001' } })
    expect(log).toMatchObject({
      type: 'IN',
      result: 'CREATED',
      accepted: true,
      userId: fx.user.id,
      unitId: unit?.id,
    })
  })

  it('ทำ serial ให้เป็นมาตรฐานก่อนเสมอ - ตัว \\r จากเครื่องสแกนและตัวพิมพ์เล็กต้องถือเป็นตัวเดียวกัน', async () => {
    const first = await scanIn('  nb0001\r\n', fx.products.notebook.id)
    expect(first.body).toMatchObject({ accepted: true, result: 'CREATED', serial: 'NB0001' })

    const second = await scanIn('NB0001', fx.products.notebook.id)
    expect(second.body).toMatchObject({ accepted: false, result: 'DUPLICATE' })
    expect(await prisma.serialUnit.count()).toBe(1)
  })

  it('ยิงซ้ำทั้งที่ของอยู่ในคลัง -> ปฏิเสธ แต่ยังบันทึก log ไว้ย้อนดูได้', async () => {
    await scanIn('NB0001', fx.products.notebook.id)
    const res = await scanIn('NB0001', fx.products.notebook.id)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ accepted: false, result: 'DUPLICATE' })
    expect(res.body.productInStock).toBe(1)
    expect(await prisma.scanLog.count({ where: { serial: 'NB0001' } })).toBe(2)
  })

  it('ของที่เคยเบิกออกไป -> รับกลับเข้าคลัง และล้าง releasedAt', async () => {
    await giveStock(fx.products.notebook.id, ['NB0001'])
    await prisma.serialUnit.update({
      where: { serial: 'NB0001' },
      data: { status: 'OUT', releasedAt: new Date() },
    })

    const res = await scanIn('NB0001', fx.products.notebook.id)

    expect(res.body).toMatchObject({ accepted: true, result: 'RETURNED' })
    const unit = await unitBySerial('NB0001')
    expect(unit?.status).toBe('IN_STOCK')
    expect(unit?.releasedAt).toBeNull()
  })

  it('serial ที่ผูกกับสินค้าอื่นอยู่แล้ว -> ปฏิเสธ ไม่ย้ายสินค้าให้เอง', async () => {
    await scanIn('NB0001', fx.products.notebook.id)
    const res = await scanIn('NB0001', fx.products.monitor.id)

    expect(res.body).toMatchObject({ accepted: false, result: 'PRODUCT_MISMATCH' })
    expect(res.body.message).toContain('โน๊ตบุ๊ค')
    expect((await unitBySerial('NB0001'))?.productId).toBe(fx.products.notebook.id)
  })

  it('serial ผิดรูปแบบ -> ตีกลับโดยไม่เขียน log ขยะ', async () => {
    const res = await scanIn('A#', fx.products.notebook.id)

    expect(res.status).toBe(200)
    expect(res.body.accepted).toBe(false)
    expect(res.body.scanLogId).toBeNull()
    expect(await prisma.scanLog.count()).toBe(0)
    expect(await prisma.serialUnit.count()).toBe(0)
  })

  it('ไม่ได้ส่ง serial มา -> 400 จาก zod', async () => {
    const res = await postJson(scanInRoute, { productId: fx.products.notebook.id })
    expect(res.status).toBe(400)
  })

  it('สินค้าที่เลือกไม่มีอยู่จริง -> 400', async () => {
    // เคสนี้ตอบเป็น { error } ไม่ใช่ ScanOutcome จึงยิงแบบไม่ผูกชนิด
    const res = await postJson<{ error: string }>(scanInRoute, {
      serial: 'NB0001',
      productId: 'ไม่มีสินค้านี้',
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('ไม่พบสินค้า')
  })

  it('ยิงรัวติดกัน 25 ตัว -> เข้าคลังครบ ไม่มีตกหล่น', async () => {
    const serials = Array.from({ length: 25 }, (_, i) => `NB${String(i + 1).padStart(4, '0')}`)

    for (const serial of serials) {
      const res = await scanIn(serial, fx.products.notebook.id)
      expect(res.body.accepted).toBe(true)
    }

    expect(
      await prisma.serialUnit.count({
        where: { productId: fx.products.notebook.id, status: 'IN_STOCK' },
      })
    ).toBe(25)
  })

  it('ยิง serial เดียวกันพร้อมกัน -> ของยังมีชิ้นเดียว (ไม่เกิดของซ้ำ)', async () => {
    const results = await Promise.all([
      scanIn('NB0001', fx.products.notebook.id),
      scanIn('NB0001', fx.products.notebook.id),
    ])

    expect(await prisma.serialUnit.count({ where: { serial: 'NB0001' } })).toBe(1)
    // ล็อกตาม serial ทำให้อีกฝั่งได้เห็นผลของฝั่งแรก -> เป็น "ยิงซ้ำ" ไม่ใช่ error ชน unique constraint
    expect(results.map((r) => r.body.result).sort()).toEqual(['CREATED', 'DUPLICATE'])
    expect(results.every((r) => r.status === 200)).toBe(true)
  })

  it('บันทึกหมายเหตุที่แนบมากับการยิงไว้ใน log', async () => {
    await scanIn('NB0001', fx.products.notebook.id, 'รับจากใบสั่งซื้อ PO-2026-001')
    const log = await prisma.scanLog.findFirst({ where: { serial: 'NB0001' } })
    expect(log?.note).toBe('รับจากใบสั่งซื้อ PO-2026-001')
  })
})
