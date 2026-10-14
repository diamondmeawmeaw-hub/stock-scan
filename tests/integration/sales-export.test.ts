import { beforeEach, describe, expect, it } from 'vitest'
import { GET as exportRoute } from '@/app/api/sales/export/route'
import { POST as scanOutRoute } from '@/app/api/scan/out/route'
import { todayInThailand } from '@/lib/date-range'
import { getBinary, postJson, prisma, seedFixtures } from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>
let fx: Fixtures

const TODAY = todayInThailand()
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const download = (query: Record<string, string>) => getBinary(exportRoute, query)

const magic = (buffer: Buffer, length: number) => buffer.subarray(0, length).toString('latin1')

describe('GET /api/sales/export', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
    await prisma.serialUnit.create({
      data: { serial: 'NB-0001', productId: fx.products.notebook.id, status: 'IN_STOCK' },
    })
  })

  it('ยังไม่ login -> 401', async () => {
    const { __clearCookies } = await import('./mocks/next-headers')
    __clearCookies()

    const res = await download({ format: 'xlsx' })
    expect(res.status).toBe(401)
  })

  it('xlsx -> ได้ไฟล์ Excel พร้อมชื่อไฟล์ภาษาไทย', async () => {
    const out = await postJson(scanOutRoute, { serial: 'NB-0001', reason: 'SALE' })
    expect(out.status).toBe(200)

    const res = await download({ format: 'xlsx' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(XLSX_TYPE)
    expect(magic(res.buffer, 4)).toBe('PK\x03\x04')

    const disposition = res.headers.get('content-disposition')!
    expect(disposition).toContain('attachment')
    expect(decodeURIComponent(disposition)).toContain(`ประวัติการขาย-${TODAY}.xlsx`)
  })

  it('pdf -> ได้ไฟล์ PDF', async () => {
    const out = await postJson(scanOutRoute, { serial: 'NB-0001', reason: 'SALE' })
    expect(out.status).toBe(200)

    const res = await download({ format: 'pdf' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(magic(res.buffer, 5)).toBe('%PDF-')
  })

  it('ตัวกรองลูกค้ามีผลกับไฟล์ที่โหลด', async () => {
    const customer = await prisma.customer.create({ data: { code: 'C1', name: 'ลูกค้า ก' } })
    await prisma.serialUnit.create({
      data: { serial: 'NB-0002', productId: fx.products.notebook.id, status: 'IN_STOCK' },
    })
    expect((await postJson(scanOutRoute, { serial: 'NB-0001', reason: 'SALE' })).status).toBe(200)
    expect(
      (
        await postJson(scanOutRoute, {
          serial: 'NB-0002',
          reason: 'SALE',
          customerId: customer.id,
        })
      ).status
    ).toBe(200)

    const ExcelJS = (await import('exceljs')).default
    const readText = async (buffer: Buffer) => {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer as unknown as ArrayBuffer)
      const lines: string[] = []
      wb.worksheets[0].eachRow((row) => lines.push((row.values as unknown[]).slice(1).join(' | ')))
      return lines.join('\n')
    }

    const all = await readText((await download({ format: 'xlsx' })).buffer)
    expect(all).toContain('NB-0001')
    expect(all).toContain('NB-0002')

    const filtered = await readText(
      (await download({ format: 'xlsx', customerId: customer.id })).buffer
    )
    expect(filtered).not.toContain('NB-0001')
    expect(filtered).toContain('NB-0002')
    expect(filtered).toContain('ลูกค้า ก')
  })
})
