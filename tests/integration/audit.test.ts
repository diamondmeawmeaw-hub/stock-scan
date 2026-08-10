import { beforeEach, describe, expect, it } from 'vitest'
import {
  GET as getSessionRoute,
  } from '@/app/api/audit/sessions/[id]/route'
import { POST as closeRoute } from '@/app/api/audit/sessions/[id]/close/route'
import { POST as auditScanRoute } from '@/app/api/audit/sessions/[id]/scan/route'
import { GET as listSessionsRoute, POST as openSessionRoute } from '@/app/api/audit/sessions/route'
import { POST as scanOutRoute } from '@/app/api/scan/out/route'
import type { AuditReport, ScanOutcome } from '@/lib/scan-service'
import { getJson, giveStock, postJson, prisma, seedFixtures } from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>
let fx: Fixtures

async function openSession(input: { name?: string; categoryId?: string | null } = {}) {
  const res = await postJson<{ session: { id: string; name: string; status: string } }>(
    openSessionRoute,
    { name: input.name ?? 'รอบตรวจนับประจำเดือน', categoryId: input.categoryId ?? null }
  )
  if (res.status !== 200) throw new Error(`เปิดรอบไม่สำเร็จ: ${JSON.stringify(res.body)}`)
  return res.body.session
}

const auditScan = (sessionId: string, serial: string) =>
  postJson<ScanOutcome>(auditScanRoute, { serial }, { id: sessionId })

const closeSession = (sessionId: string, applyAdjustments = false) =>
  postJson<{ report: AuditReport }>(closeRoute, { applyAdjustments }, { id: sessionId })

const report = (sessionId: string) =>
  getJson<{ report: AuditReport }>(getSessionRoute, { id: sessionId })

describe('การตรวจนับสต็อก (audit)', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
    // ระบบเชื่อว่ามีของทั้งหมด 5 ชิ้น: โน๊ตบุ๊ค 3 (หมวด IT), สว่าน 2 (หมวด TOOL)
    await giveStock(fx.products.notebook.id, ['NB0001', 'NB0002', 'NB0003'])
    await giveStock(fx.products.drill.id, ['DRL0001', 'DRL0002'])
  })

  it('ยังไม่ login -> เปิดรอบไม่ได้', async () => {
    const { __clearCookies } = await import('./mocks/next-headers')
    __clearCookies()

    const res = await postJson(openSessionRoute, { name: 'แอบเปิด' })
    expect(res.status).toBe(401)
    expect(await prisma.auditSession.count()).toBe(0)
  })

  it('นับครบทุกชิ้น -> ไม่มีของหาย ไม่มีของเกิน', async () => {
    const session = await openSession()
    for (const serial of ['NB0001', 'NB0002', 'NB0003', 'DRL0001', 'DRL0002']) {
      const res = await auditScan(session.id, serial)
      expect(res.body).toMatchObject({ accepted: true, result: 'OK' })
    }

    const { body } = await closeSession(session.id)
    expect(body.report).toMatchObject({
      status: 'CLOSED',
      expectedCount: 5,
      scannedCount: 5,
      matchedCount: 5,
    })
    expect(body.report.missing).toEqual([])
    expect(body.report.surplus).toEqual([])
  })

  it('นับไม่ครบ -> ตัวที่ยิงไม่เจอขึ้นเป็นของหาย พร้อมบอกว่าเป็นสินค้าอะไร', async () => {
    const session = await openSession()
    await auditScan(session.id, 'NB0001')
    await auditScan(session.id, 'DRL0001')

    const { body } = await closeSession(session.id)
    expect(body.report.expectedCount).toBe(5)
    expect(body.report.scannedCount).toBe(2)
    expect(body.report.missing.map((m) => m.serial).sort()).toEqual([
      'DRL0002',
      'NB0002',
      'NB0003',
    ])
    expect(body.report.missing[0]).toMatchObject({ sku: expect.any(String), productName: expect.any(String) })
  })

  it('เจอของที่ระบบว่าเบิกออกไปแล้ว -> รับไว้เป็นของเกิน', async () => {
    await postJson(scanOutRoute, { serial: 'NB0003', reason: 'SALE' })

    const session = await openSession()
    const res = await auditScan(session.id, 'NB0003')
    expect(res.body).toMatchObject({ accepted: true, result: 'FOUND_BUT_OUT' })

    const { body } = await closeSession(session.id)
    expect(body.report.expectedCount).toBe(4) // NB0003 ถูกเบิกออกไปแล้ว ระบบจึงไม่นับว่าอยู่ในคลัง
    expect(body.report.surplus.map((s) => s.serial)).toEqual(['NB0003'])
  })

  it('ยิงซ้ำในรอบเดียวกัน -> เตือน ไม่นับซ้ำ', async () => {
    const session = await openSession()
    await auditScan(session.id, 'NB0001')
    const again = await auditScan(session.id, 'NB0001')

    expect(again.body).toMatchObject({ accepted: false, result: 'DUPLICATE' })
    const { body } = await report(session.id)
    expect(body.report.scannedCount).toBe(1)
  })

  it('รอบที่จำกัดหมวดหมู่ -> ของนอกหมวดถูกปฏิเสธ และไม่ถูกนับเป็นของหาย', async () => {
    const session = await openSession({ categoryId: fx.categories.it.id })

    const outside = await auditScan(session.id, 'DRL0001')
    expect(outside.body).toMatchObject({ accepted: false, result: 'NOT_IN_SCOPE' })

    for (const serial of ['NB0001', 'NB0002', 'NB0003']) {
      expect((await auditScan(session.id, serial)).body.accepted).toBe(true)
    }

    const { body } = await closeSession(session.id)
    expect(body.report.categoryName).toBe('อุปกรณ์ไอที')
    expect(body.report.expectedCount).toBe(3) // นับเฉพาะของในหมวด IT
    expect(body.report.missing).toEqual([])
  })

  it('ยิง serial ที่ระบบไม่รู้จัก -> ขึ้นในรายงานแยกไว้ให้ตามเก็บ', async () => {
    const session = await openSession()
    const res = await auditScan(session.id, 'GHOST-001')
    expect(res.body).toMatchObject({ accepted: false, result: 'UNKNOWN_SERIAL' })

    await auditScan(session.id, 'GHOST-001') // ยิงซ้ำไม่ทำให้รายงานมีบรรทัดซ้ำ
    const { body } = await report(session.id)
    expect(body.report.unknownSerials.map((u) => u.serial)).toEqual(['GHOST-001'])
    expect(body.report.scannedCount).toBe(0)
  })

  it('เปิดรอบใหม่ขณะยังมีรอบค้างอยู่ -> 409 พร้อมบอกชื่อรอบเดิม', async () => {
    await openSession({ name: 'รอบแรก' })
    const res = await postJson(openSessionRoute, { name: 'รอบสอง' })

    expect(res.status).toBe(409)
    expect(res.body.error).toContain('รอบแรก')
    expect(await prisma.auditSession.count()).toBe(1)
  })

  it('ปิดรอบแล้วยิงต่อไม่ได้ และปิดซ้ำไม่ได้', async () => {
    const session = await openSession()
    await auditScan(session.id, 'NB0001')
    await closeSession(session.id)

    expect((await auditScan(session.id, 'NB0002')).status).toBe(409)
    expect((await closeSession(session.id)).status).toBe(409)
  })

  it('รายงานของรอบที่ปิดแล้วเป็น snapshot - สต็อกที่เปลี่ยนทีหลังไม่ทำให้ตัวเลขเพี้ยน', async () => {
    const session = await openSession()
    await auditScan(session.id, 'NB0001')
    const closed = await closeSession(session.id)
    expect(closed.body.report.expectedCount).toBe(5)

    // หลังปิดรอบ มีการเบิกของออกไปอีก
    await postJson(scanOutRoute, { serial: 'NB0002', reason: 'SALE' })

    const { body } = await report(session.id)
    expect(body.report.expectedCount).toBe(5)
    expect(body.report.missing.length).toBe(4)
    expect(body.report.closedAt).toBe(closed.body.report.closedAt)
  })

  it('ปิดรอบแบบปรับสต็อกตามผลนับ -> ของหายถูกตัดออก ของเกินถูกรับเข้า', async () => {
    await postJson(scanOutRoute, { serial: 'DRL0002', reason: 'SALE' }) // ระบบว่าไม่อยู่ในคลัง

    const session = await openSession()
    await auditScan(session.id, 'NB0001')
    await auditScan(session.id, 'DRL0002') // แต่ยิงเจอของจริง -> ของเกิน

    const { body } = await closeSession(session.id, true)
    expect(body.report.missing.map((m) => m.serial).sort()).toEqual([
      'DRL0001',
      'NB0002',
      'NB0003',
    ])
    expect(body.report.surplus.map((s) => s.serial)).toEqual(['DRL0002'])

    const units = await prisma.serialUnit.findMany({ orderBy: { serial: 'asc' } })
    expect(Object.fromEntries(units.map((u) => [u.serial, u.status]))).toEqual({
      DRL0001: 'OUT',
      DRL0002: 'IN_STOCK',
      NB0001: 'IN_STOCK',
      NB0002: 'OUT',
      NB0003: 'OUT',
    })
  })

  it('ปิดรอบแบบปรับสต็อก -> มี log ว่านับแล้วหาย/เกิน ก่อนปรับสต็อก', async () => {
    await postJson(scanOutRoute, { serial: 'DRL0002', reason: 'SALE' })

    const session = await openSession({ name: 'รอบ ส.ค.' })
    await auditScan(session.id, 'NB0001')
    await auditScan(session.id, 'DRL0002')
    await closeSession(session.id, true)

    const logs = await prisma.scanLog.findMany({
      where: { auditSessionId: session.id, result: { in: ['MISSING', 'FOUND_BUT_OUT'] } },
      orderBy: { serial: 'asc' },
    })

    expect(logs.filter((l) => l.result === 'MISSING').map((l) => l.serial)).toEqual([
      'DRL0001',
      'NB0002',
      'NB0003',
    ])
    expect(logs.filter((l) => l.result === 'FOUND_BUT_OUT').map((l) => l.serial)).toEqual([
      'DRL0002',
    ])
    expect(logs.every((l) => l.type === 'AUDIT' && l.accepted && l.unitId && l.productId)).toBe(true)
    expect(logs.find((l) => l.serial === 'NB0002')?.message).toContain('รอบ ส.ค.')
  })

  it('ปิดรอบแบบไม่ปรับสต็อก -> ไม่มี log ของหาย', async () => {
    const session = await openSession()
    await auditScan(session.id, 'NB0001')
    await closeSession(session.id, false)

    expect(await prisma.scanLog.count({ where: { result: 'MISSING' } })).toBe(0)
  })

  it('ปิดรอบแบบไม่ปรับสต็อก -> ตัวเลขในคลังคงเดิม (แค่รายงานให้ดู)', async () => {
    const session = await openSession()
    await auditScan(session.id, 'NB0001')
    await closeSession(session.id, false)

    expect(await prisma.serialUnit.count({ where: { status: 'IN_STOCK' } })).toBe(5)
  })

  it('ยิงเข้ารอบที่ไม่มีอยู่จริง -> 404', async () => {
    const res = await auditScan('ไม่มีรอบนี้', 'NB0001')
    expect(res.status).toBe(404)
  })

  it('รายการรอบตรวจนับ -> บอกสถานะและจำนวนที่ยิงไปแล้ว', async () => {
    const session = await openSession({ name: 'รอบ ก.ค.' })
    await auditScan(session.id, 'NB0001')
    await auditScan(session.id, 'GHOST-1') // ไม่ถูกรับ ไม่ควรถูกนับ

    const { body } = await getJson<{ sessions: any[] }>(listSessionsRoute)
    expect(body.sessions[0]).toMatchObject({
      name: 'รอบ ก.ค.',
      status: 'OPEN',
      scannedCount: 1,
      startedBy: 'staff',
    })
  })

  it('ยิงรัวติดกันทั้งคลัง 30 ชิ้น -> นับครบทุกชิ้น', async () => {
    const serials = Array.from({ length: 30 }, (_, i) => `MON${String(i + 1).padStart(4, '0')}`)
    await giveStock(fx.products.monitor.id, serials)

    const session = await openSession({ categoryId: fx.categories.it.id })
    for (const serial of serials) {
      expect((await auditScan(session.id, serial)).body.accepted).toBe(true)
    }

    const { body } = await report(session.id)
    expect(body.report.scannedCount).toBe(30)
    expect(body.report.missing.map((m) => m.serial).sort()).toEqual(['NB0001', 'NB0002', 'NB0003'])
  })
})
