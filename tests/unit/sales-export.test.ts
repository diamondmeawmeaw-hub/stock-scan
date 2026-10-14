import { describe, expect, it } from 'vitest'
import { salesToExcel } from '@/lib/reports/excel'
import { salesToPdf } from '@/lib/reports/pdf'
import type { SalesReport } from '@/lib/scan-service'

const META = { generatedAt: new Date('2026-08-06T10:00:00+07:00') }

const salesReport: SalesReport = {
  rows: [
    {
      id: 'log1',
      at: '2026-08-02T10:00:00+07:00',
      serial: 'SN001',
      quantity: 1,
      productName: 'โน๊ตบุ๊ค',
      sku: 'IT-NB-001',
      customerName: 'C001 · บริษัท ABC',
      projectName: 'ติดกล้อง ตึก 1',
      userName: 'staff',
      note: null,
      reversed: false,
    },
    {
      id: 'log2',
      at: '2026-08-03T10:00:00+07:00',
      serial: null,
      quantity: 5,
      productName: 'สายแลน',
      sku: 'CB-001',
      customerName: null,
      projectName: null,
      userName: 'staff',
      note: 'ขายหน้าร้าน',
      reversed: true,
    },
  ],
  total: 2,
}

async function readSheet(buffer: Buffer) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const sheet = wb.worksheets[0]
  const rows: unknown[][] = []
  sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1)))
  return { name: sheet.name, rows }
}

describe('export ประวัติการขายเป็น Excel', () => {
  it('มีหัวคอลัมน์ครบ แถวรายชิ้น/นับจำนวน และยอดรวม', async () => {
    const { name, rows } = await readSheet(await salesToExcel(salesReport, META))

    expect(name).toBe('ประวัติการขาย')
    expect(rows[0][0]).toBe('รายงานประวัติการขาย')

    const header = rows.find((r) => r[0] === 'เวลา')!
    expect(header).toEqual([
      'เวลา',
      'ลูกค้า',
      'โปรเจค',
      'Serial',
      'สินค้า',
      'จำนวน',
      'ผู้ทำรายการ',
      'หมายเหตุ',
      'สถานะ',
    ])

    const serial = rows.find((r) => r[3] === 'SN001')!
    expect(serial[1]).toBe('C001 · บริษัท ABC')
    expect(serial[2]).toBe('ติดกล้อง ตึก 1')

    // ของนับจำนวนไม่มี serial
    const qty = rows.find((r) => r[3] === '-')!
    expect(qty[4]).toBe('สายแลน (CB-001)')
    // คืนแล้วต้องเห็นสถานะ
    expect(qty[8]).toBe('คืนแล้ว')

    expect(rows.find((r) => r[6] === 'รวม')).toBeDefined()
  })

  it('ตัวกรองที่ใช้ถูกเขียนไว้ในหัวรายงาน', async () => {
    const { rows } = await readSheet(
      await salesToExcel(salesReport, { ...META, customerName: 'บริษัท ABC', projectName: 'ติดกล้อง ตึก 1' })
    )
    expect(rows[2][0]).toBe('ตัวกรอง: ผู้ซื้อ: บริษัท ABC · โปรเจค: ติดกล้อง ตึก 1')
  })

  it('รายงานว่าง -> ขึ้นข้อความแทนตารางเปล่า', async () => {
    const { rows } = await readSheet(await salesToExcel({ rows: [], total: 0 }, META))
    expect(rows.some((r) => r[0] === 'ไม่มีประวัติการขายตามเงื่อนไขที่เลือก')).toBe(true)
  })
})

describe('export ประวัติการขายเป็น PDF', () => {
  const isPdf = (buffer: Buffer) => buffer.subarray(0, 5).toString('latin1')

  it('ได้ไฟล์ PDF ที่ใช้ได้', async () => {
    const buffer = await salesToPdf(salesReport, META)
    expect(isPdf(buffer)).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('รายงานว่างก็ยังออกไฟล์ได้ ไม่ล้ม', async () => {
    expect(isPdf(await salesToPdf({ rows: [], total: 0 }, META))).toBe('%PDF-')
  })
})
