import { beforeEach, describe, expect, it } from 'vitest'
import { buildSalesSummary } from '@/lib/scan-service'
import { prisma, seedFixtures } from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>

let fx: Fixtures
let productId: string
let customerId: string
let projectId: string
let otherCustomerId: string
let otherProjectId: string

async function createSale(input: {
  quantity?: number
  serial?: string | null
  customerId?: string | null
  projectId?: string | null
  productId?: string
}) {
  return prisma.scanLog.create({
    data: {
      type: 'OUT',
      reason: 'SALE',
      result: 'OK',
      accepted: true,
      quantity: input.quantity ?? 1,
      serial: input.serial ?? null,
      userId: fx.user.id,
      productId: input.productId ?? productId,
      customerId: input.customerId === undefined ? customerId : input.customerId,
      projectId: input.projectId === undefined ? projectId : input.projectId,
    },
  })
}

async function returnSale(originalId: string, quantity: number) {
  await prisma.scanLog.create({
    data: {
      type: 'IN',
      result: 'RETURNED',
      accepted: true,
      quantity,
      userId: fx.user.id,
      productId,
      customerId,
      projectId,
      reversesId: originalId,
    },
  })
}

describe('buildSalesSummary (รวมรายการซ้ำ)', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
    productId = fx.products.notebook.id

    const customer = await prisma.customer.create({ data: { code: 'C1', name: 'ลูกค้า ก' } })
    const otherCustomer = await prisma.customer.create({ data: { code: 'C2', name: 'ลูกค้า ข' } })
    customerId = customer.id
    otherCustomerId = otherCustomer.id

    projectId = (
      await prisma.project.create({
        data: { customerId, name: 'งานที่ 1', active: true },
      })
    ).id
    otherProjectId = (
      await prisma.project.create({
        data: { customerId: otherCustomerId, name: 'งานที่ 2', active: true },
      })
    ).id
  })

  it('สินค้าเดียวกันในงานเดียวกัน -> รวมเป็นแถวเดียวและบวกจำนวน', async () => {
    await createSale({ serial: 'NB-0001' })
    await createSale({ serial: 'NB-0002' })
    await createSale({ serial: 'NB-0003' })

    const summary = await buildSalesSummary()

    expect(summary.rows).toHaveLength(1)
    expect(summary.rows[0]).toMatchObject({
      productId,
      customerName: 'C1 · ลูกค้า ก',
      projectName: 'งานที่ 1',
      quantity: 3,
      returnedQty: 0,
      netQty: 3,
      rounds: 3,
    })
    expect(summary.totalRounds).toBe(3)
  })

  it('สินค้าเดียวกันแต่คนละโปรเจค -> แยกกลุ่ม', async () => {
    await createSale({ serial: 'NB-0001' })
    await createSale({ serial: 'NB-0002', customerId: otherCustomerId, projectId: otherProjectId })

    const summary = await buildSalesSummary()

    expect(summary.rows).toHaveLength(2)
    expect(summary.rows.map((r) => r.netQty).sort()).toEqual([1, 1])
  })

  it('รายการที่คืนแล้ว -> ไม่นับใน netQty แต่แสดงยอดคืนแยก', async () => {
    const first = await createSale({ quantity: 10 })
    await createSale({ quantity: 5 })
    await returnSale(first.id, 10)

    const summary = await buildSalesSummary()

    expect(summary.rows).toHaveLength(1)
    expect(summary.rows[0]).toMatchObject({
      quantity: 15,
      returnedQty: 10,
      netQty: 5,
      rounds: 2,
    })
    expect(summary.totalReturned).toBe(10)
    expect(summary.totalNet).toBe(5)
  })

  it('กรองตามโปรเจค -> เห็นเฉพาะยอดของงานนั้น', async () => {
    await createSale({ serial: 'NB-0001' })
    await createSale({ serial: 'NB-0002', customerId: otherCustomerId, projectId: otherProjectId })

    const summary = await buildSalesSummary({ projectId })

    expect(summary.rows).toHaveLength(1)
    expect(summary.rows[0].projectName).toBe('งานที่ 1')
    expect(summary.totalNet).toBe(1)
  })

  it('สินค้าแบบนับจำนวน -> รวม quantity ตามจำนวนจริง', async () => {
    const cable = await prisma.product.create({
      data: {
        sku: 'IT-CBL-001',
        name: 'สาย LAN',
        categoryId: fx.categories.it.id,
        trackingType: 'QUANTITY',
        stockQty: 100,
        unitLabel: 'เมตร',
      },
    })

    await createSale({ productId: cable.id, quantity: 12 })
    await createSale({ productId: cable.id, quantity: 8 })
    await createSale({ serial: 'NB-0001' })

    const summary = await buildSalesSummary()

    expect(summary.rows).toHaveLength(2)
    const cableRow = summary.rows.find((r) => r.productId === cable.id)!
    expect(cableRow).toMatchObject({ quantity: 20, netQty: 20, rounds: 2, unitLabel: 'เมตร' })
  })
})
