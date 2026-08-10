import { beforeEach, describe, expect, it } from 'vitest'
import { POST as scanInRoute } from '@/app/api/scan/in/route'
import { POST as scanOutRoute } from '@/app/api/scan/out/route'
import { GET as searchRoute } from '@/app/api/serials/route'
import { GET as detailRoute } from '@/app/api/serials/[serial]/route'
import type { SerialDetail, SerialSearchRow } from '@/lib/scan-service'
import { getJson, giveStock, postJson, seedFixtures } from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>
let fx: Fixtures

const lookup = (serial: string) => getJson<SerialDetail>(detailRoute, { serial })
const search = (q: string) => getJson<{ rows: SerialSearchRow[] }>(searchRoute, {}, { q })

const scanIn = (serial: string, productId: string) =>
  postJson(scanInRoute, { serial, productId })
const scanOut = (serial: string, reason = 'SALE', note?: string) =>
  postJson(scanOutRoute, { serial, reason, note })

describe('ค้นหาตาม serial', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
  })

  it('ยังไม่ login -> 401', async () => {
    const { __clearCookies } = await import('./mocks/next-headers')
    __clearCookies()

    expect((await lookup('NB0001')).status).toBe(401)
    expect((await search('NB')).status).toBe(401)
  })

  it('ของที่รับเข้าแล้ว -> บอกสถานะ สินค้า และวันรับเข้า', async () => {
    await scanIn('NB0001', fx.products.notebook.id)

    const res = await lookup('NB0001')

    expect(res.status).toBe(200)
    expect(res.body.unit).toMatchObject({
      status: 'IN_STOCK',
      sku: 'IT-NB-001',
      productName: 'โน๊ตบุ๊ค',
      categoryName: 'อุปกรณ์ไอที',
    })
    expect(res.body.unit?.receivedAt).toBeTruthy()
    expect(res.body.unit?.releasedAt).toBeNull()
  })

  it('รับเข้าแล้วเบิกออก -> มีทั้งวันรับเข้าและวันเบิกออก เรียงประวัติจากใหม่ไปเก่า', async () => {
    await scanIn('NB0001', fx.products.notebook.id)
    await scanOut('NB0001', 'INTERNAL_USE', 'ยืมไปไซต์ A')

    const { body } = await lookup('NB0001')

    expect(body.unit?.status).toBe('OUT')
    expect(body.unit?.receivedAt).toBeTruthy()
    expect(body.unit?.releasedAt).toBeTruthy()

    expect(body.history.map((h) => h.type)).toEqual(['OUT', 'IN'])
    expect(body.history[0]).toMatchObject({
      type: 'OUT',
      result: 'OK',
      accepted: true,
      reason: 'INTERNAL_USE',
      note: 'ยืมไปไซต์ A',
      userName: 'staff',
    })
    // ประวัติต้องเรียงจากใหม่ไปเก่าเสมอ
    expect(new Date(body.history[0].at).getTime()).toBeGreaterThanOrEqual(
      new Date(body.history[1].at).getTime()
    )
  })

  it('ของหมุนเวียนหลายรอบ -> เห็นครบทุกครั้งที่รับเข้า/เบิกออก', async () => {
    await scanIn('NB0001', fx.products.notebook.id)
    await scanOut('NB0001', 'DAMAGED')
    await scanIn('NB0001', fx.products.notebook.id)
    await scanOut('NB0001', 'SALE')

    const { body } = await lookup('NB0001')

    expect(body.history.map((h) => h.type)).toEqual(['OUT', 'IN', 'OUT', 'IN'])
    expect(body.history.map((h) => h.result)).toEqual(['OK', 'RETURNED', 'OK', 'CREATED'])
    expect(body.unit?.status).toBe('OUT')
  })

  it('เก็บครั้งที่ระบบปฏิเสธไว้ด้วย เพื่อย้อนดูว่าใครยิงผิดเมื่อไหร่', async () => {
    await giveStock(fx.products.notebook.id, ['NB0001'])
    await scanIn('NB0001', fx.products.notebook.id) // ยิงซ้ำทั้งที่อยู่ในคลัง

    const { body } = await lookup('NB0001')

    expect(body.history).toHaveLength(1)
    expect(body.history[0]).toMatchObject({ result: 'DUPLICATE', accepted: false })
  })

  it('serial ที่ไม่เคยรับเข้า แต่เคยถูกยิง -> ไม่มี unit แต่มีประวัติ', async () => {
    await scanOut('ZZZ9999')

    const { body } = await lookup('ZZZ9999')

    expect(body.unit).toBeNull()
    expect(body.history[0]).toMatchObject({ result: 'UNKNOWN_SERIAL', accepted: false })
  })

  it('serial ที่ไม่เคยมีในระบบเลย -> ไม่มีทั้ง unit และประวัติ', async () => {
    const { body } = await lookup('NEVERSEEN')

    expect(body.unit).toBeNull()
    expect(body.history).toEqual([])
  })

  it('ค้นหาแบบพิมพ์ไม่ครบ -> เจอทุกตัวที่ขึ้นต้นเหมือนกัน เรียงตาม serial', async () => {
    await giveStock(fx.products.notebook.id, ['NB0003', 'NB0001', 'NB0002'])
    await giveStock(fx.products.drill.id, ['DR0001'])

    const { body } = await search('NB')

    expect(body.rows.map((r) => r.serial)).toEqual(['NB0001', 'NB0002', 'NB0003'])
    expect(body.rows[0]).toMatchObject({ sku: 'IT-NB-001', status: 'IN_STOCK' })
  })

  it('ค้นหาด้วยตัวพิมพ์เล็ก -> เจอเหมือนกัน (เครื่องสแกนบางรุ่นส่งพิมพ์เล็ก)', async () => {
    await giveStock(fx.products.notebook.id, ['NB0001'])

    expect((await search('nb0001')).body.rows.map((r) => r.serial)).toEqual(['NB0001'])
    expect((await lookup('nb0001')).body.unit?.sku).toBe('IT-NB-001')
  })

  it('คำค้นว่าง -> คืนรายการว่าง ไม่ใช่ทั้งคลัง', async () => {
    await giveStock(fx.products.notebook.id, ['NB0001', 'NB0002'])

    expect((await search('   ')).body.rows).toEqual([])
  })

  it('ประวัติจากรอบตรวจนับ -> บอกชื่อรอบที่ยิงด้วย', async () => {
    await giveStock(fx.products.notebook.id, ['NB0001'])
    const { POST: openRoute } = await import('@/app/api/audit/sessions/route')
    const { POST: auditScanRoute } = await import('@/app/api/audit/sessions/[id]/scan/route')

    const session = await postJson(openRoute, { name: 'นับรอบสิ้นเดือน' })
    await postJson(auditScanRoute, { serial: 'NB0001' }, { id: session.body.session.id })

    const { body } = await lookup('NB0001')

    expect(body.history[0]).toMatchObject({
      type: 'AUDIT',
      result: 'OK',
      auditSessionName: 'นับรอบสิ้นเดือน',
    })
  })
})
