import { beforeEach, describe, expect, it } from 'vitest'
import { PATCH as scanLogPatchRoute } from '@/app/api/scan-logs/[id]/route'
import { POST as qtyInRoute } from '@/app/api/quantity/in/route'
import { POST as qtyOutRoute } from '@/app/api/quantity/out/route'
import { PATCH as projectPatchRoute } from '@/app/api/projects/[id]/route'
import { GET as projectsGetRoute, POST as projectsPostRoute } from '@/app/api/projects/route'
import { POST as scanOutRoute } from '@/app/api/scan/out/route'
import { POST as scanReturnRoute } from '@/app/api/scan/return/route'
import {
  getJson,
  giveStock,
  patchJson,
  postJson,
  prisma,
  seedFixtures,
  unitBySerial,
} from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>
let fx: Fixtures
let custA: { id: string }
let custB: { id: string }

async function makeCustomer(code: string, name: string) {
  return prisma.customer.create({ data: { code, name } })
}

async function makeProject(customerId: string, name: string) {
  return prisma.project.create({ data: { customerId, name } })
}

/** เบิกขายผ่าน route จริง พร้อมผูกลูกค้า/โปรเจค */
function sell(serial: string, extra: Record<string, unknown> = {}) {
  return postJson(scanOutRoute, { serial, reason: 'SALE', ...extra })
}

describe('ระบบโปรเจคของลูกค้า', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
    await giveStock(fx.products.notebook.id, ['NB0001', 'NB0002', 'NB0003'])
    custA = await makeCustomer('CUST-A', 'คณะนิติ')
    custB = await makeCustomer('CUST-B', 'คณะวิศวะ')
  })

  describe('สร้างและลิสต์โปรเจค', () => {
    it('สร้างโปรเจคผูกกับลูกค้า -> เรียกดูกลับได้', async () => {
      const res = await postJson(projectsPostRoute, { customerId: custA.id, name: 'ติดกล้อง' })
      expect(res.status).toBe(200)
      expect(res.body.project).toMatchObject({ customerId: custA.id, name: 'ติดกล้อง', active: true })

      const list = await getJson(projectsGetRoute, undefined, { customerId: custA.id })
      expect(list.body.projects).toHaveLength(1)
      expect(list.body.projects[0].name).toBe('ติดกล้อง')
    })

    it('กรอกชื่อว่าง / ลูกค้าไม่มีจริง -> 400', async () => {
      const empty = await postJson(projectsPostRoute, { customerId: custA.id, name: '   ' })
      expect(empty.status).toBe(400)

      const noCustomer = await postJson(projectsPostRoute, { customerId: 'nope', name: 'งาน A' })
      expect(noCustomer.status).toBe(400)
      expect(await prisma.project.count()).toBe(0)
    })

    it('ลิสต์แยกตามลูกค้าได้', async () => {
      await makeProject(custA.id, 'โปรเจค A1')
      await makeProject(custB.id, 'โปรเจค B1')

      const all = await getJson(projectsGetRoute)
      expect(all.body.projects).toHaveLength(2)

      const onlyA = await getJson(projectsGetRoute, undefined, { customerId: custA.id })
      expect(onlyA.body.projects.map((p: { name: string }) => p.name)).toEqual(['โปรเจค A1'])
    })

    it('เปลี่ยนชื่อและปิด-เปิดโปรเจคได้', async () => {
      const project = await makeProject(custA.id, 'ชื่อเดิม')

      const renamed = await patchJson(projectPatchRoute, { name: 'ชื่อใหม่' }, { id: project.id })
      expect(renamed.status).toBe(200)
      expect(renamed.body.project.name).toBe('ชื่อใหม่')

      const closed = await patchJson(projectPatchRoute, { active: false }, { id: project.id })
      expect(closed.body.project.active).toBe(false)

      const missing = await patchJson(projectPatchRoute, { name: 'x' }, { id: 'nope' })
      expect(missing.status).toBe(404)
    })
  })

  describe('เบิกขายพร้อมผูกโปรเจค', () => {
    it('ยิง serial ขายพร้อมโปรเจค -> log ผูกโปรเจคและลูกค้าครบ', async () => {
      const project = await makeProject(custA.id, 'ติดกล้อง ตึก 1')

      const res = await sell('NB0001', { customerId: custA.id, projectId: project.id })
      expect(res.status).toBe(200)
      expect(res.body.accepted).toBe(true)

      const log = await prisma.scanLog.findFirst({ where: { serial: 'NB0001', type: 'OUT' } })
      expect(log).toMatchObject({ customerId: custA.id, projectId: project.id })
      expect((await unitBySerial('NB0001'))?.status).toBe('OUT')
    })

    it('เอาโปรเจคของลูกค้าอื่นมาใส่ -> 400 และของยังอยู่ในคลัง', async () => {
      const projectB = await makeProject(custB.id, 'งานของ B')

      const res = await sell('NB0001', { customerId: custA.id, projectId: projectB.id })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('ไม่ได้เป็นของลูกค้า')
      expect((await unitBySerial('NB0001'))?.status).toBe('IN_STOCK')
    })

    it('ไม่ได้เลือกลูกค้าแต่ส่งโปรเจคมา -> 400', async () => {
      const project = await makeProject(custA.id, 'ติด wifi')
      const res = await sell('NB0001', { projectId: project.id })
      expect(res.status).toBe(400)
      expect((await unitBySerial('NB0001'))?.status).toBe('IN_STOCK')
    })

    it('ปิดโปรเจคแล้ว -> เบิกขายเข้าโปรเจคนั้นไม่ได้ แต่ของชิ้นอื่นขายได้ตามปกติ', async () => {
      const project = await makeProject(custA.id, 'งานจบแล้ว')
      await patchJson(projectPatchRoute, { active: false }, { id: project.id })

      const blocked = await sell('NB0001', { customerId: custA.id, projectId: project.id })
      expect(blocked.status).toBe(400)
      expect(blocked.body.error).toContain('ปิดใช้งาน')
      expect((await unitBySerial('NB0001'))?.status).toBe('IN_STOCK')

      const ok = await sell('NB0002', { customerId: custA.id })
      expect(ok.status).toBe(200)
      const log = await prisma.scanLog.findFirst({ where: { serial: 'NB0002', type: 'OUT' } })
      expect(log?.projectId).toBeNull()
    })

    it('เบิกที่ไม่ใช่เหตุผลขาย -> ไม่ผูกโปรเจค (ของกับลูกค้าไม่เกี่ยว)', async () => {
      const project = await makeProject(custA.id, 'ติดกล้อง')
      const res = await postJson(scanOutRoute, {
        serial: 'NB0001',
        reason: 'INTERNAL_USE',
        customerId: custA.id,
        projectId: project.id,
      })
      expect(res.status).toBe(200)

      const log = await prisma.scanLog.findFirst({ where: { serial: 'NB0001', type: 'OUT' } })
      expect(log).toMatchObject({ customerId: null, projectId: null })
    })

    it('ขายแบบกรอกจำนวนพร้อมโปรเจค -> log ผูกด้วย', async () => {
      const rack = await prisma.product.create({
        data: {
          sku: 'RK-9U-001',
          name: 'ตู้แร็ค 9U',
          categoryId: fx.categories.it.id,
          trackingType: 'QUANTITY',
          unitLabel: 'ตู้',
        },
      })
      await postJson(qtyInRoute, { productId: rack.id, quantity: 5 })
      const project = await makeProject(custA.id, 'ติด wifi ห้องประชุม')

      const res = await postJson(qtyOutRoute, {
        productId: rack.id,
        quantity: 2,
        reason: 'SALE',
        customerId: custA.id,
        projectId: project.id,
      })
      expect(res.status).toBe(200)

      const log = await prisma.scanLog.findFirst({ where: { productId: rack.id, type: 'OUT' } })
      expect(log).toMatchObject({ customerId: custA.id, projectId: project.id, quantity: 2 })
    })
  })

  describe('ย้ายรายการขายข้ามโปรเจค', () => {
    it('ย้ายได้ -> log ชี้โปรเจคใหม่ และถอดออกด้วย null ได้', async () => {
      const p1 = await makeProject(custA.id, 'ติดกล้อง')
      const p2 = await makeProject(custA.id, 'ติด wifi')
      const sold = await sell('NB0001', { customerId: custA.id, projectId: p1.id })
      const logId = (sold.body as { scanLogId: string }).scanLogId

      const moved = await patchJson(scanLogPatchRoute, { projectId: p2.id }, { id: logId })
      expect(moved.status).toBe(200)
      expect(moved.body.scanLog.projectId).toBe(p2.id)

      const detached = await patchJson(scanLogPatchRoute, { projectId: null }, { id: logId })
      expect(detached.status).toBe(200)
      expect(detached.body.scanLog.projectId).toBeNull()
    })

    it('ย้ายไปโปรเจคของลูกค้าอื่น -> 400 ไม่ยอม', async () => {
      const p1 = await makeProject(custA.id, 'ติดกล้อง')
      const projectB = await makeProject(custB.id, 'งาน B')
      const sold = await sell('NB0001', { customerId: custA.id, projectId: p1.id })

      const res = await patchJson(scanLogPatchRoute, { projectId: projectB.id }, { id: sold.body.scanLogId })
      expect(res.status).toBe(400)
      const log = await prisma.scanLog.findUnique({ where: { id: sold.body.scanLogId } })
      expect(log?.projectId).toBe(p1.id)
    })

    it('รายการที่ไม่ใช่ขาย (ยืมใช้ภายใน) -> ย้ายไม่ได้', async () => {
      const project = await makeProject(custA.id, 'ติดกล้อง')
      await postJson(scanOutRoute, { serial: 'NB0001', reason: 'INTERNAL_USE' })
      const log = await prisma.scanLog.findFirst({ where: { serial: 'NB0001', type: 'OUT' } })

      const res = await patchJson(scanLogPatchRoute, { projectId: project.id }, { id: log!.id })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('รายการขายที่สำเร็จ')
    })

    it('รายการที่คืนของไปแล้ว -> ย้ายไม่ได้ 409', async () => {
      const project = await makeProject(custA.id, 'ติดกล้อง')
      const sold = await sell('NB0001', { customerId: custA.id, projectId: project.id })
      await postJson(scanReturnRoute, { scanLogId: sold.body.scanLogId })

      const res = await patchJson(scanLogPatchRoute, { projectId: project.id }, { id: sold.body.scanLogId })
      expect(res.status).toBe(409)
    })
  })
})
