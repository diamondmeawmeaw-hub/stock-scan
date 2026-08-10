import { beforeEach, describe, expect, it } from 'vitest'
import { POST as scanInRoute } from '@/app/api/scan/in/route'
import { POST as scanOutRoute } from '@/app/api/scan/out/route'
import type { OutReasonCode, ScanOutcome } from '@/lib/scan-service'
import { giveStock, postJson, prisma, seedFixtures, unitBySerial } from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>
let fx: Fixtures

const scanOut = (serial: string, reason: OutReasonCode = 'SALE', note?: string) =>
  postJson<ScanOutcome>(scanOutRoute, { serial, reason, note })

describe('POST /api/scan/out', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
    await giveStock(fx.products.notebook.id, ['NB0001', 'NB0002', 'NB0003'])
  })

  it('ยังไม่ login -> 401 และของยังอยู่ในคลัง', async () => {
    const { __clearCookies } = await import('./mocks/next-headers')
    __clearCookies()

    const res = await scanOut('NB0001')
    expect(res.status).toBe(401)
    expect((await unitBySerial('NB0001'))?.status).toBe('IN_STOCK')
  })

  it('ของอยู่ในคลัง -> เบิกออกสำเร็จ พร้อมบอกยอดคงเหลือของสินค้านั้น', async () => {
    const res = await scanOut('NB0001', 'SALE')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ accepted: true, result: 'OK', serial: 'NB0001' })
    expect(res.body.product?.name).toBe('โน๊ตบุ๊ค')
    expect(res.body.productInStock).toBe(2)

    const unit = await unitBySerial('NB0001')
    expect(unit?.status).toBe('OUT')
    expect(unit?.releasedAt).toBeInstanceOf(Date)

    const log = await prisma.scanLog.findFirst({ where: { serial: 'NB0001', type: 'OUT' } })
    expect(log).toMatchObject({ result: 'OK', accepted: true, reason: 'SALE', userId: fx.user.id })
  })

  it('เบิกซ้ำ -> ปฏิเสธ ยอดคงเหลือไม่ติดลบ', async () => {
    await scanOut('NB0001')
    const res = await scanOut('NB0001')

    expect(res.body).toMatchObject({ accepted: false, result: 'ALREADY_OUT' })
    expect(res.body.productInStock).toBe(2)
  })

  it('serial ที่ระบบไม่รู้จัก -> ปฏิเสธ แต่ยังบันทึก log ไว้ตามรอย', async () => {
    const res = await scanOut('ZZZ9999')

    expect(res.body).toMatchObject({ accepted: false, result: 'UNKNOWN_SERIAL', product: null })
    const log = await prisma.scanLog.findFirst({ where: { serial: 'ZZZ9999' } })
    expect(log).toMatchObject({ type: 'OUT', result: 'UNKNOWN_SERIAL', unitId: null })
  })

  it('เหตุผลการเบิกต้องอยู่ในรายการที่กำหนด', async () => {
    const res = await postJson(scanOutRoute, { serial: 'NB0001', reason: 'ไม่รู้' })
    expect(res.status).toBe(400)
    expect((await unitBySerial('NB0001'))?.status).toBe('IN_STOCK')
  })

  it('เก็บเหตุผลได้ครบทุกแบบ', async () => {
    const reasons: OutReasonCode[] = ['SALE', 'INTERNAL_USE', 'DAMAGED']
    const serials = ['NB0001', 'NB0002', 'NB0003']

    for (const [i, reason] of reasons.entries()) {
      const res = await scanOut(serials[i], reason)
      expect(res.body.accepted).toBe(true)
    }

    const logs = await prisma.scanLog.findMany({ where: { type: 'OUT' }, orderBy: { serial: 'asc' } })
    expect(logs.map((l) => l.reason)).toEqual(reasons)
  })

  it('ยิงเบิกรัวติดกัน -> คลังเหลือศูนย์ และรายงานยอดถูกต้องทุกครั้ง', async () => {
    const counts: number[] = []
    for (const serial of ['NB0001', 'NB0002', 'NB0003']) {
      const res = await scanOut(serial)
      counts.push(res.body.productInStock!)
    }

    expect(counts).toEqual([2, 1, 0])
    expect(
      await prisma.serialUnit.count({
        where: { productId: fx.products.notebook.id, status: 'IN_STOCK' },
      })
    ).toBe(0)
  })

  it('ยิงเบิก serial เดียวกันพร้อมกัน -> ยอมรับได้ครั้งเดียว', async () => {
    const results = await Promise.all([scanOut('NB0001'), scanOut('NB0001')])
    const accepted = results.filter((r) => r.body.accepted)

    expect(accepted.length).toBe(1)
    expect((await unitBySerial('NB0001'))?.status).toBe('OUT')
  })

  it('เบิกออกแล้วรับกลับเข้าคลัง -> เบิกออกได้อีกรอบ (ของหมุนเวียนได้)', async () => {
    await scanOut('NB0001', 'INTERNAL_USE')
    const back = await postJson<ScanOutcome>(scanInRoute, {
      serial: 'NB0001',
      productId: fx.products.notebook.id,
    })
    expect(back.body.result).toBe('RETURNED')

    const again = await scanOut('NB0001', 'DAMAGED')
    expect(again.body).toMatchObject({ accepted: true, result: 'OK' })
    expect(await prisma.scanLog.count({ where: { serial: 'NB0001' } })).toBe(3)
  })
})
