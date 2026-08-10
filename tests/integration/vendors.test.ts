import { beforeEach, describe, expect, it } from 'vitest'
import { GET as listRoute, POST as createRoute } from '@/app/api/vendors/route'
import { DELETE as deleteRoute, PATCH as patchRoute } from '@/app/api/vendors/[id]/route'
import { POST as scanInRoute } from '@/app/api/scan/in/route'
import { GET as detailRoute } from '@/app/api/serials/[serial]/route'
import { GET as stockReportRoute } from '@/app/api/reports/stock/route'
import type { SerialDetail } from '@/lib/scan-service'
import { deleteJson, getJson, login, patchJson, postJson, prisma, seedFixtures } from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>
let fx: Fixtures

const createVendor = (body: unknown) => postJson(createRoute, body)
const listVendors = () => getJson(listRoute)
const lookup = (serial: string) => getJson<SerialDetail>(detailRoute, { serial })

const asAdmin = () => login('admin', 'admin123')
const asStaff = () => login('staff', 'staff123')

async function seedVendor(code = 'SIS', name = 'SiS Distribution') {
  return prisma.vendor.create({ data: { code, name } })
}

describe('จัดการผู้ขาย', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
  })

  it('staff ดูรายการและเพิ่มผู้ขายได้', async () => {
    await seedVendor()

    expect((await listVendors()).status).toBe(200)
    expect((await createVendor({ code: 'ing', name: 'Ingram' })).status).toBe(200)
  })

  it('เพิ่มผู้ขายแล้วรหัสถูกแปลงเป็นตัวใหญ่', async () => {
    await asAdmin()

    const res = await createVendor({ code: 'sis', name: 'SiS Distribution' })

    expect(res.status).toBe(200)
    expect(res.body.vendor).toMatchObject({ code: 'SIS', name: 'SiS Distribution', active: true })
  })

  it('รหัสซ้ำ -> 409', async () => {
    await asAdmin()
    await createVendor({ code: 'SIS', name: 'SiS' })

    const res = await createVendor({ code: 'sis', name: 'SiS อีกอัน' })

    expect(res.status).toBe(409)
  })

  it('ลบผู้ขายที่ยังไม่มีของผูกอยู่ได้', async () => {
    await asAdmin()
    const vendor = await seedVendor()

    const res = await deleteJson(deleteRoute, { id: vendor.id })

    expect(res.status).toBe(200)
    expect(await prisma.vendor.findUnique({ where: { id: vendor.id } })).toBeNull()
  })

  it('ลบผู้ขายที่มีของผูกอยู่ไม่ได้ -> 409 และของยังอยู่ครบ', async () => {
    const vendor = await seedVendor()
    await postJson(scanInRoute, {
      serial: 'NB0001',
      productId: fx.products.notebook.id,
      vendorId: vendor.id,
    })
    await asAdmin()

    const res = await deleteJson(deleteRoute, { id: vendor.id })

    expect(res.status).toBe(409)
    expect(res.body.error).toContain('1 ชิ้น')
    expect(await prisma.vendor.findUnique({ where: { id: vendor.id } })).not.toBeNull()
  })

  it('ปิดใช้งานแทนการลบได้ ประวัติของที่รับไปแล้วยังอยู่', async () => {
    const vendor = await seedVendor()
    await postJson(scanInRoute, {
      serial: 'NB0001',
      productId: fx.products.notebook.id,
      vendorId: vendor.id,
    })
    await asAdmin()

    const res = await patchJson(patchRoute, { active: false }, { id: vendor.id })

    expect(res.status).toBe(200)
    expect(res.body.vendor.active).toBe(false)
    await asStaff()
    expect((await lookup('NB0001')).body.unit?.vendorName).toBe('SiS Distribution')
  })
})

describe('รับเข้าพร้อมระบุผู้ขาย', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
  })

  const scanIn = (serial: string, vendorId?: string | null) =>
    postJson(scanInRoute, { serial, productId: fx.products.notebook.id, vendorId })

  it('ผู้ขายที่ระบุไปโผล่ทั้งที่ตัวของและในประวัติ', async () => {
    const vendor = await seedVendor()

    expect((await scanIn('NB0001', vendor.id)).status).toBe(200)

    const res = await lookup('NB0001')
    expect(res.body.unit?.vendorName).toBe('SiS Distribution')
    expect(res.body.history[0].vendorName).toBe('SiS Distribution')
  })

  it('ไม่ระบุผู้ขายก็รับเข้าได้ ค่าเป็นว่าง', async () => {
    expect((await scanIn('NB0001', null)).status).toBe(200)

    const res = await lookup('NB0001')
    expect(res.body.unit?.vendorName).toBeNull()
  })

  it('ผู้ขายที่ไม่มีอยู่จริง -> 400 และไม่รับของเข้า', async () => {
    const res = await scanIn('NB0001', 'ไม่มีอยู่จริง')

    expect(res.status).toBe(400)
    expect(await prisma.serialUnit.findUnique({ where: { serial: 'NB0001' } })).toBeNull()
  })

  it('ผู้ขายที่ปิดใช้งานอยู่ -> 400', async () => {
    const vendor = await prisma.vendor.create({
      data: { code: 'OLD', name: 'เจ้าเก่า', active: false },
    })

    const res = await scanIn('NB0001', vendor.id)

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('ปิดใช้งาน')
  })

  it('รับกลับเข้ามาโดยไม่ระบุผู้ขาย -> คงเจ้าเดิมไว้', async () => {
    const vendor = await seedVendor()
    await scanIn('NB0001', vendor.id)
    await postJson((await import('@/app/api/scan/out/route')).POST, {
      serial: 'NB0001',
      reason: 'SALE',
    })

    await scanIn('NB0001', null)

    expect((await lookup('NB0001')).body.unit?.vendorName).toBe('SiS Distribution')
  })

  it('รับกลับเข้ามาโดยระบุผู้ขายรายใหม่ -> ของเปลี่ยนเจ้า แต่ประวัติรอบเก่ายังชี้เจ้าเดิม', async () => {
    const sis = await seedVendor()
    const ingram = await seedVendor('ING', 'Ingram Micro')
    await scanIn('NB0001', sis.id)
    await postJson((await import('@/app/api/scan/out/route')).POST, {
      serial: 'NB0001',
      reason: 'RETURN_SUPPLIER',
    })

    await scanIn('NB0001', ingram.id)

    const res = await lookup('NB0001')
    expect(res.body.unit?.vendorName).toBe('Ingram Micro')
    // ประวัติเรียงใหม่ก่อนเก่า: [รับเข้ารอบใหม่, เบิกออก, รับเข้ารอบแรก]
    expect(res.body.history.map((h) => h.vendorName)).toEqual([
      'Ingram Micro',
      null,
      'SiS Distribution',
    ])
  })
})

describe('ตัวกรองผู้ขายในรายงาน', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
  })

  it('กรองยอดคงเหลือตามผู้ขาย -> นับเฉพาะของที่รับจากเจ้านั้น', async () => {
    const sis = await seedVendor()
    const ingram = await seedVendor('ING', 'Ingram Micro')
    const scanIn = (serial: string, vendorId: string, productId: string) =>
      postJson(scanInRoute, { serial, productId, vendorId })

    await scanIn('NB0001', sis.id, fx.products.notebook.id)
    await scanIn('NB0002', sis.id, fx.products.notebook.id)
    await scanIn('MON0001', ingram.id, fx.products.monitor.id)

    const all = await getJson(stockReportRoute, {}, {})
    expect(all.body.grandTotalInStock).toBe(3)

    const onlySis = await getJson(stockReportRoute, {}, { vendorId: sis.id })
    expect(onlySis.body.grandTotalInStock).toBe(2)
    const skus = onlySis.body.categories.flatMap((c: any) => c.products.map((p: any) => p.sku))
    expect(skus).toEqual(['IT-NB-001'])
  })
})
