import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { movementDetailedToExcel, stockToExcel } from '@/lib/reports/excel'
import { movementDetailedToPdf, stockToPdf } from '@/lib/reports/pdf'
import type { MovementDetailReport, StockReportRow } from '@/lib/scan-service'

const GENERATED_AT = new Date('2026-08-06T10:00:00+07:00')
const META = { generatedAt: GENERATED_AT }

const stockReport = {
  categories: [
    {
      categoryId: 'c1',
      categoryCode: 'IT',
      categoryName: 'อุปกรณ์ไอที',
      products: [
        { productId: 'p1', sku: 'IT-NB-001', name: 'โน๊ตบุ๊ค', brand: 'Dell', inStock: 2, out: 1 },
        { productId: 'p2', sku: 'IT-MON-002', name: 'จอมอนิเตอร์', brand: null, inStock: 3, out: 0 },
      ],
      totalInStock: 5,
    },
  ] satisfies StockReportRow[],
  grandTotalInStock: 5,
}

const movementReport: MovementDetailReport = {
  from: '2026-08-01',
  to: '2026-08-06',
  rows: [
    {
      id: 'log1',
      at: '2026-08-02T10:00:00+07:00',
      serial: 'SN001',
      type: 'IN',
      result: 'CREATED',
      message: null,
      reason: null,
      note: null,
      sku: 'IT-NB-001',
      productName: 'โน๊ตบุ๊ค',
      brand: 'Dell',
      categoryName: 'อุปกรณ์ไอที',
      userName: 'admin',
      customerName: null,
    },
    {
      id: 'log2',
      at: '2026-08-04T14:00:00+07:00',
      serial: 'SN001',
      type: 'OUT',
      result: 'CREATED',
      message: null,
      reason: 'SALE',
      note: null,
      sku: 'IT-NB-001',
      productName: 'โน๊ตบุ๊ค',
      brand: 'Dell',
      categoryName: 'อุปกรณ์ไอที',
      userName: 'admin',
      customerName: 'C001 · บริษัท ABC',
    },
  ],
  totalIn: 1,
  totalOut: 1,
}

async function readSheet(buffer: Buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const sheet = wb.worksheets[0]
  const rows: unknown[][] = []
  sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1)))
  return { name: sheet.name, rows }
}

describe('export ยอดคงเหลือเป็น Excel', () => {
  it('มีหัวคอลัมน์ ตัวเลขเป็นตัวเลขจริง และยอดรวมถูกต้อง', async () => {
    const { name, rows } = await readSheet(await stockToExcel(stockReport, META))

    expect(name).toBe('ยอดคงเหลือ')
    expect(rows[0][0]).toBe('รายงานยอดคงเหลือ')

    const header = rows.find((r) => r[0] === 'SKU')!
    expect(header).toEqual(['SKU', 'สินค้า', 'แบรนด์', 'คงเหลือ', 'เบิกออกไปแล้ว'])

    const notebook = rows.find((r) => r[0] === 'IT-NB-001')!
    expect(notebook).toEqual(['IT-NB-001', 'โน๊ตบุ๊ค', 'Dell', 2, 1])
    // แบรนด์ว่างต้องเป็นขีด ไม่ใช่ช่องว่างเปล่า
    expect(rows.find((r) => r[0] === 'IT-MON-002')![2]).toBe('-')

    expect(rows.find((r) => r[2] === 'รวมทั้งหมด')![3]).toBe(5)
  })

  it('ตัวกรองที่ใช้ถูกเขียนไว้ในหัวรายงาน', async () => {
    const { rows } = await readSheet(
      await stockToExcel(stockReport, { ...META, categoryName: 'อุปกรณ์ไอที', brand: 'Dell' })
    )
    expect(rows[2][0]).toBe('ตัวกรอง: ประเภทของ: อุปกรณ์ไอที · แบรนด์: Dell')
  })

  it('ไม่ได้กรอง -> บอกว่าเป็นทั้งหมด', async () => {
    const { rows } = await readSheet(await stockToExcel(stockReport, META))
    expect(rows[2][0]).toBe('ตัวกรอง: ไม่ได้กรอง (ทั้งหมด)')
  })

  it('รายงานว่าง -> ขึ้นข้อความแทนตารางเปล่า', async () => {
    const { rows } = await readSheet(
      await stockToExcel({ categories: [], grandTotalInStock: 0 }, META)
    )
    expect(rows.some((r) => r[0] === 'ไม่พบสินค้าตามเงื่อนไขที่เลือก')).toBe(true)
  })
})

describe('export ความเคลื่อนไหวเป็น Excel', () => {
  it('มีแถวสินค้าและแถวรวมท้ายตาราง', async () => {
    const { name, rows } = await readSheet(await movementDetailedToExcel(movementReport, META))

    expect(name).toBe('ความเคลื่อนไหว')
    expect(rows.find((r) => r[0] === 'วันที่')).toEqual([
      'วันที่', 'รายการ', 'Serial', 'สินค้า', 'SKU', 'ผู้ซื้อ / ลูกค้า', 'ผู้ทำรายการ', 'หมายเหตุ',
    ])
    expect(rows.find((r) => r[2] === 'SN001')).toBeDefined()
    expect(rows.find((r) => r[6] === 'รวม')).toBeDefined()
  })

  it('ช่วงวันที่ไม่มีความเคลื่อนไหว -> ขึ้นข้อความแทน', async () => {
    const { rows } = await readSheet(
      await movementDetailedToExcel({ ...movementReport, rows: [], totalIn: 0, totalOut: 0 }, META)
    )
    expect(rows.some((r) => r[0] === 'ช่วงวันที่นี้ไม่มีการรับเข้าหรือเบิกออก')).toBe(true)
  })
})

describe('export เป็น PDF', () => {
  const isPdf = (buffer: Buffer) => buffer.subarray(0, 5).toString('latin1')

  it('ยอดคงเหลือได้ไฟล์ PDF ที่ใช้ได้', async () => {
    const buffer = await stockToPdf(stockReport, META)
    expect(isPdf(buffer)).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('ความเคลื่อนไหวได้ไฟล์ PDF ที่ใช้ได้', async () => {
    const buffer = await movementDetailedToPdf(movementReport, META)
    expect(isPdf(buffer)).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('รายงานว่างก็ยังออกไฟล์ได้ ไม่ล้ม', async () => {
    expect(isPdf(await stockToPdf({ categories: [], grandTotalInStock: 0 }, META))).toBe('%PDF-')
    expect(
      isPdf(await movementDetailedToPdf({ ...movementReport, rows: [], totalIn: 0, totalOut: 0 }, META))
    ).toBe('%PDF-')
  })
})
