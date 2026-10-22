import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as downloadRoute } from '@/app/api/exports/[id]/download/route'
import { GET as statusRoute } from '@/app/api/exports/[id]/route'
import { POST as createRoute } from '@/app/api/exports/route'
import { processExportJob } from '@/lib/exports/jobs'
import { getJson, giveStock, postJson, prisma, seedFixtures } from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>
let fx: Fixtures

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const EXPORT_DIR = path.join(os.tmpdir(), 'stock-scan-export-tests')

process.env.EXPORT_DIR = EXPORT_DIR

async function download(id: string): Promise<{ status: number; headers: Headers; buffer: Buffer }> {
  const response = await downloadRoute(
    new Request(`http://localhost:3000/api/exports/${id}/download`),
    { params: Promise.resolve({ id }) }
  )
  return {
    status: response.status,
    headers: response.headers,
    buffer: Buffer.from(await response.arrayBuffer()),
  }
}

async function createAndProcess(body: Record<string, unknown>) {
  const created = await postJson<{ id: string }>(createRoute, body)
  expect(created.status).toBe(200)
  const id = created.body.id
  await processExportJob(id)
  const status = await getJson(statusRoute, { id })
  expect(status.status).toBe(200)
  return { id, status: status.body }
}

async function sheetText(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const lines: string[] = []
  wb.worksheets[0].eachRow((row) => lines.push((row.values as unknown[]).slice(1).join(' | ')))
  return lines.join('\n')
}

describe('export jobs', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
  })

  afterAll(async () => {
    await rm(EXPORT_DIR, { recursive: true, force: true })
  })

  it('ยังไม่ login -> 401', async () => {
    const { __clearCookies } = await import('./mocks/next-headers')
    __clearCookies()

    const res = await postJson(createRoute, { type: 'sales', format: 'xlsx' })
    expect(res.status).toBe(401)
  })

  it('สร้างไฟล์ Excel เบื้องหลังแล้วดาวน์โหลดได้', async () => {
    const job = await createAndProcess({ type: 'sales', format: 'xlsx' })

    expect(job.status.status).toBe('DONE')
    expect(job.status.fileName).toMatch(/\.xlsx$/)
    expect(job.status.downloadUrl).toBe(`/api/exports/${job.id}/download`)

    const file = await download(job.id)
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toBe(XLSX_TYPE)
    expect(file.buffer.subarray(0, 4).toString('latin1')).toBe('PK\x03\x04')
    expect(decodeURIComponent(file.headers.get('content-disposition')!)).toContain('.xlsx')
  })

  it('สร้างไฟล์ PDF เบื้องหลังได้', async () => {
    const job = await createAndProcess({ type: 'reports', view: 'stock', format: 'pdf' })
    expect(job.status.status).toBe('DONE')

    const file = await download(job.id)
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toBe('application/pdf')
    expect(file.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('เกินเพดานปกติ -> สลับไปเขียน XLSX แบบ streaming และยังได้ไฟล์ครบ', async () => {
    const previous = process.env.EXPORT_ROW_LIMIT
    process.env.EXPORT_ROW_LIMIT = '10'
    try {
      await giveStock(fx.products.notebook.id, Array.from({ length: 7 }, (_, i) => `NB-S-${i}`))
      await giveStock(fx.products.monitor.id, Array.from({ length: 7 }, (_, i) => `MON-S-${i}`))

      const job = await createAndProcess({ type: 'reports', view: 'stock', format: 'xlsx' })
      expect(job.status.status).toBe('DONE')

      const file = await download(job.id)
      expect(file.status).toBe(200)
      const text = await sheetText(file.buffer)
      expect(text).toContain('NB-S-0')
      expect(text).toContain('NB-S-6')
      expect(text).toContain('MON-S-6')
    } finally {
      if (previous === undefined) delete process.env.EXPORT_ROW_LIMIT
      else process.env.EXPORT_ROW_LIMIT = previous
    }
  })

  it('ประวัติการขายเกินเพดาน -> streaming ได้ครบทุกแถว', async () => {
    const previous = process.env.EXPORT_ROW_LIMIT
    process.env.EXPORT_ROW_LIMIT = '10'
    try {
      await prisma.scanLog.createMany({
        data: Array.from({ length: 14 }, (_, i) => ({
          serial: `SALE-S-${i}`,
          quantity: 1,
          type: 'OUT' as const,
          reason: 'SALE' as const,
          accepted: true,
          result: 'OK' as const,
          userId: fx.user.id,
          productId: fx.products.notebook.id,
        })),
      })

      const job = await createAndProcess({ type: 'sales', format: 'xlsx' })
      expect(job.status.status).toBe('DONE')

      const text = await sheetText((await download(job.id)).buffer)
      expect(text).toContain('SALE-S-0')
      expect(text).toContain('SALE-S-13')
      expect(text).toContain('14 รายการ')
    } finally {
      if (previous === undefined) delete process.env.EXPORT_ROW_LIMIT
      else process.env.EXPORT_ROW_LIMIT = previous
    }
  })

  it('ความเคลื่อนไหวเกินเพดาน -> streaming ได้ครบทุกแถว', async () => {
    const previous = process.env.EXPORT_ROW_LIMIT
    process.env.EXPORT_ROW_LIMIT = '10'
    try {
      await prisma.scanLog.createMany({
        data: Array.from({ length: 14 }, (_, i) => ({
          serial: `MOVE-S-${i}`,
          quantity: 1,
          type: 'IN' as const,
          result: 'CREATED' as const,
          accepted: true,
          userId: fx.user.id,
          productId: fx.products.notebook.id,
        })),
      })

      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())
      const job = await createAndProcess({
        type: 'reports',
        view: 'movement',
        format: 'xlsx',
        from: today,
        to: today,
      })
      expect(job.status.status).toBe('DONE')

      const text = await sheetText((await download(job.id)).buffer)
      expect(text).toContain('MOVE-S-0')
      expect(text).toContain('MOVE-S-13')
      expect(text).toContain('รับเข้า 14')
    } finally {
      if (previous === undefined) delete process.env.EXPORT_ROW_LIMIT
      else process.env.EXPORT_ROW_LIMIT = previous
    }
  })

  it('PDF เกินเพดาน -> FAILED พร้อมบอกให้ใช้ Excel', async () => {
    const previous = process.env.EXPORT_ROW_LIMIT
    process.env.EXPORT_ROW_LIMIT = '10'
    try {
      await giveStock(fx.products.notebook.id, Array.from({ length: 14 }, (_, i) => `NB-P-${i}`))

      const job = await createAndProcess({ type: 'reports', view: 'stock', format: 'pdf' })
      expect(job.status.status).toBe('FAILED')
      expect(job.status.error).toContain('PDF')
      expect(job.status.error).toContain('Excel')
    } finally {
      if (previous === undefined) delete process.env.EXPORT_ROW_LIMIT
      else process.env.EXPORT_ROW_LIMIT = previous
    }
  })

  it('คนอื่นเปิดงานของเราไม่ได้', async () => {
    const job = await createAndProcess({ type: 'sales', format: 'xlsx' })

    const { createUser, login } = await import('./helpers')
    await createUser({ username: 'other', password: 'other123' })
    await login('other', 'other123')

    const status = await getJson(statusRoute, { id: job.id })
    expect(status.status).toBe(404)

    const file = await download(job.id)
    expect(file.status).toBe(404)
  })

  it('ล้างงานที่หมดอายุแล้วออกจากฐานข้อมูล', async () => {
    const job = await createAndProcess({ type: 'sales', format: 'xlsx' })
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    // createExportJob เรียก cleanupExpiredExports ก่อนสร้างงานใหม่
    await createAndProcess({ type: 'sales', format: 'xlsx' })
    expect(await prisma.exportJob.findUnique({ where: { id: job.id } })).toBeNull()
  })
})
