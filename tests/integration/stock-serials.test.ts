import { beforeEach, describe, expect, it } from 'vitest'
import { GET as stockSerialsRoute } from '@/app/api/reports/stock-serials/route'
import { POST as returnRoute } from '@/app/api/scan/return/route'
import { POST as scanOutRoute } from '@/app/api/scan/out/route'
import { buildOutReport, buildStockReport } from '@/lib/scan-service'
import { getJson, giveStock, postJson, prisma, seedFixtures } from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>

type SerialPage = {
  product: { id: string; sku: string; name: string } | null
  serials: { serial: string; status: string; customerName: string | null }[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

let fx: Fixtures

const load = (query: Record<string, string>) =>
  getJson<SerialPage>(stockSerialsRoute, undefined, query)

describe('GET /api/reports/stock-serials (pagination)', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
  })

  it('แบ่งหน้าเริ่มต้น 100 รายการ และหน้าถัดไปไม่ซ้ำกัน', async () => {
    const serials = Array.from({ length: 125 }, (_, i) => `PAGE-${String(i + 1).padStart(3, '0')}`)
    await giveStock(fx.products.notebook.id, serials)

    const first = await load({
      productId: fx.products.notebook.id,
      status: 'IN_STOCK',
    })
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({
      total: 125,
      page: 1,
      pageSize: 100,
      totalPages: 2,
    })
    expect(first.body.serials).toHaveLength(100)
    expect(first.body.serials[0].serial).toBe('PAGE-001')
    expect(first.body.serials.at(-1)?.serial).toBe('PAGE-100')

    const second = await load({
      productId: fx.products.notebook.id,
      status: 'IN_STOCK',
      page: '2',
    })
    expect(second.body).toMatchObject({ total: 125, page: 2, totalPages: 2 })
    expect(second.body.serials).toHaveLength(25)
    expect(second.body.serials[0].serial).toBe('PAGE-101')
    expect(second.body.serials.at(-1)?.serial).toBe('PAGE-125')

    const all = [...first.body.serials, ...second.body.serials].map((s) => s.serial)
    expect(new Set(all).size).toBe(125)
  })

  it('กำหนด pageSize เองได้ และหน้าเกินช่วงถูก clamp ไปหน้าสุดท้าย', async () => {
    const serials = Array.from({ length: 75 }, (_, i) => `SIZE-${String(i + 1).padStart(3, '0')}`)
    await giveStock(fx.products.notebook.id, serials)

    const second = await load({
      productId: fx.products.notebook.id,
      status: 'IN_STOCK',
      page: '2',
      pageSize: '30',
    })
    expect(second.body).toMatchObject({
      total: 75,
      page: 2,
      pageSize: 30,
      totalPages: 3,
    })
    expect(second.body.serials).toHaveLength(30)
    expect(second.body.serials[0].serial).toBe('SIZE-031')

    const beyond = await load({
      productId: fx.products.notebook.id,
      status: 'IN_STOCK',
      page: '99',
      pageSize: '30',
    })
    expect(beyond.body).toMatchObject({ total: 75, page: 3, totalPages: 3 })
    expect(beyond.body.serials).toHaveLength(15)
    expect(beyond.body.serials[0].serial).toBe('SIZE-061')
  })

  it('timePeriod ไม่ตัด serial เก่าออกจากรายละเอียด และลูกค้ายังกรองได้', async () => {
    const customer = await prisma.customer.create({
      data: { code: 'C-PAGE', name: 'ลูกค้าแบ่งหน้า' },
    })
    await giveStock(fx.products.notebook.id, ['FLT-001', 'FLT-002', 'FLT-003'])

    expect(
      (
        await postJson(scanOutRoute, {
          serial: 'FLT-001',
          reason: 'SALE',
          customerId: customer.id,
        })
      ).status
    ).toBe(200)
    expect((await postJson(scanOutRoute, { serial: 'FLT-002', reason: 'SALE' })).status).toBe(200)

    // FLT-001 เบิกออกเมื่อ 10 วันก่อน - รายงานสรุปยังนับยอดเบิกออกทั้งหมดของสินค้า
    // เพราะสินค้านี้มีรายการเบิกออกใน 7 วัน (FLT-002) จึงต้องแสดงทั้งสองรายการ
    await prisma.serialUnit.update({
      where: { serial: 'FLT-001' },
      data: { releasedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    })

    const summary = await buildOutReport({ timePeriod: '7d' })
    const notebook = summary.categories
      .flatMap((c) => c.products)
      .find((p) => p.productId === fx.products.notebook.id)
    expect(notebook?.out).toBe(2)

    const recent = await load({
      productId: fx.products.notebook.id,
      status: 'OUT',
      timePeriod: '7d',
    })
    expect(recent.body).toMatchObject({ total: 2, page: 1, totalPages: 1 })
    expect(recent.body.serials.map((s) => s.serial)).toEqual(['FLT-001', 'FLT-002'])

    const byCustomer = await load({
      productId: fx.products.notebook.id,
      status: 'OUT',
      customerId: customer.id,
    })
    expect(byCustomer.body).toMatchObject({ total: 1, page: 1, totalPages: 1 })
    expect(byCustomer.body.serials.map((s) => s.serial)).toEqual(['FLT-001'])
  })

  it('timePeriod ของรายละเอียดคงเหลือตรงกับยอดสรุป แม้ของบางชิ้นรับเข้านานแล้ว', async () => {
    await giveStock(fx.products.notebook.id, ['OLD-001', 'NEW-001'])
    await prisma.serialUnit.update({
      where: { serial: 'OLD-001' },
      data: { receivedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    })

    const summary = await buildStockReport({ timePeriod: '7d' })
    const notebook = summary.categories
      .flatMap((c) => c.products)
      .find((p) => p.productId === fx.products.notebook.id)
    expect(notebook?.inStock).toBe(2)

    const detail = await load({
      productId: fx.products.notebook.id,
      status: 'IN_STOCK',
      timePeriod: '7d',
    })
    expect(detail.body).toMatchObject({ total: 2, page: 1, totalPages: 1 })
    expect(detail.body.serials.map((s) => s.serial)).toEqual(['NEW-001', 'OLD-001'])
  })

  it('ของที่ขายแล้วถูกคืน -> ไม่แสดงชื่อผู้ซื้อเดิมว่าเป็นผู้ซื้อปัจจุบัน', async () => {
    const customer = await prisma.customer.create({
      data: { code: 'C-RETURN', name: 'ลูกค้าคืนของ' },
    })
    await giveStock(fx.products.notebook.id, ['RET-001'])

    const sold = await postJson<{ scanLogId: string }>(scanOutRoute, {
      serial: 'RET-001',
      reason: 'SALE',
      customerId: customer.id,
    })
    expect(sold.status).toBe(200)
    expect((await postJson(returnRoute, { scanLogId: sold.body.scanLogId })).status).toBe(200)

    const inStock = await load({
      productId: fx.products.notebook.id,
      status: 'IN_STOCK',
    })
    expect(inStock.body.serials).toHaveLength(1)
    expect(inStock.body.serials[0]).toMatchObject({
      serial: 'RET-001',
      status: 'IN_STOCK',
      customerName: null,
    })
  })
})
