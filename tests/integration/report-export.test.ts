import ExcelJS from 'exceljs'
import { beforeEach, describe, expect, it } from 'vitest'
import { GET as exportRoute } from '@/app/api/reports/export/route'
import { POST as scanInRoute } from '@/app/api/scan/in/route'
import { todayInThailand } from '@/lib/date-range'
import { getBinary, postJson, prisma, seedFixtures } from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>
let fx: Fixtures

const TODAY = todayInThailand()
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const download = (query: Record<string, string>) => getBinary(exportRoute, query)

const magic = (buffer: Buffer, length: number) => buffer.subarray(0, length).toString('latin1')

/** อ่านทุกเซลล์ในชีตแรกออกมาเป็นข้อความก้อนเดียว ไว้เช็คว่ามี/ไม่มีอะไรอยู่ในไฟล์ */
async function sheetText(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const lines: string[] = []
  wb.worksheets[0].eachRow((row) => lines.push((row.values as unknown[]).slice(1).join(' | ')))
  return lines.join('\n')
}

describe('GET /api/reports/export', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
  })

  it('ยังไม่ login -> 401', async () => {
    const { __clearCookies } = await import('./mocks/next-headers')
    __clearCookies()

    const res = await download({ view: 'stock', format: 'xlsx' })
    expect(res.status).toBe(401)
  })

  it('ยอดคงเหลือเป็น xlsx -> ได้ไฟล์ Excel พร้อมชื่อไฟล์ภาษาไทย', async () => {
    const res = await download({ view: 'stock', format: 'xlsx' })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(XLSX_TYPE)
    expect(magic(res.buffer, 4)).toBe('PK\x03\x04')

    const disposition = res.headers.get('content-disposition')!
    expect(disposition).toContain('attachment')
    expect(decodeURIComponent(disposition)).toContain(`ยอดคงเหลือ-${TODAY}.xlsx`)
  })

  it('ยอดคงเหลือเป็น pdf -> ได้ไฟล์ PDF', async () => {
    const res = await download({ view: 'stock', format: 'pdf' })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(magic(res.buffer, 5)).toBe('%PDF-')
  })

  it('ความเคลื่อนไหวได้ทั้ง xlsx และ pdf', async () => {
    const range = { view: 'movement', from: TODAY, to: TODAY }

    const xlsx = await download({ ...range, format: 'xlsx' })
    expect(xlsx.status).toBe(200)
    expect(magic(xlsx.buffer, 4)).toBe('PK\x03\x04')
    expect(decodeURIComponent(xlsx.headers.get('content-disposition')!)).toContain(
      `ความเคลื่อนไหว-${TODAY}.xlsx`
    )

    const pdf = await download({ ...range, format: 'pdf' })
    expect(pdf.status).toBe(200)
    expect(magic(pdf.buffer, 5)).toBe('%PDF-')
  })

  it('ตัวกรองมีผลกับไฟล์ที่โหลด -> เห็นเฉพาะประเภทที่กรอง', async () => {
    await postJson(scanInRoute, { serial: 'NB0001', productId: fx.products.notebook.id })
    await postJson(scanInRoute, { serial: 'DRL0001', productId: fx.products.drill.id })

    const all = await sheetText((await download({ view: 'stock', format: 'xlsx' })).buffer)
    expect(all).toContain('IT-NB-001')
    expect(all).toContain('TL-DRL-001')

    const onlyIt = await sheetText(
      (await download({ view: 'stock', format: 'xlsx', categoryId: fx.categories.it.id })).buffer
    )
    expect(onlyIt).toContain('IT-NB-001')
    expect(onlyIt).not.toContain('TL-DRL-001')
    // ชื่อประเภทที่กรองไว้ต้องโผล่ในหัวรายงานด้วย
    expect(onlyIt).toContain('ตัวกรอง: ประเภทของ: อุปกรณ์ไอที')
  })

  it('กรองตามผู้ขาย -> หัวรายงานบอกชื่อผู้ขาย', async () => {
    const vendor = await prisma.vendor.create({ data: { code: 'SIS', name: 'SiS Distribution' } })

    const text = await sheetText(
      (await download({ view: 'stock', format: 'xlsx', vendorId: vendor.id })).buffer
    )
    expect(text).toContain('ผู้ขาย: SiS Distribution')
  })

  it('ความเคลื่อนไหวแต่ไม่ส่งช่วงวันที่ -> 400', async () => {
    const res = await download({ view: 'movement', format: 'xlsx' })
    expect(res.status).toBe(400)
  })

  it('รูปแบบไฟล์ที่ไม่รองรับ -> 400', async () => {
    expect((await download({ view: 'stock', format: 'docx' })).status).toBe(400)
    expect((await download({ view: 'stock', format: '' })).status).toBe(400)
  })

  it('ประเภทรายงานที่ไม่รู้จัก -> 400', async () => {
    expect((await download({ view: 'มั่ว', format: 'pdf' })).status).toBe(400)
  })
})
