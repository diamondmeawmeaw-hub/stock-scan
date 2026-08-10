import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { movementToExcel, stockToExcel } from '@/lib/reports/excel'
import { movementToPdf, stockToPdf } from '@/lib/reports/pdf'
import type { MovementReport, StockReportRow } from '@/lib/scan-service'

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

const movementReport: MovementReport = {
  from: '2026-08-01',
  to: '2026-08-06',
  rows: [
    {
      productId: 'p1',
      sku: 'IT-NB-001',
      name: 'โน๊ตบุ๊ค',
      brand: 'Dell',
      categoryName: 'อุปกรณ์ไอที',
      inCount: 4,
      outCount: 1,
    },
  ],
  totalIn: 4,
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
    const { name, rows } = await readSheet(await movementToExcel(movementReport, META))

    expect(name).toBe('ความเคลื่อนไหว')
    expect(rows.find((r) => r[0] === 'SKU')).toEqual([
      'SKU',
      'สินค้า',
      'แบรนด์',
      'ประเภทของ',
      'รับเข้า',
      'เบิกออก',
    ])
    expect(rows.find((r) => r[0] === 'IT-NB-001')).toEqual([
      'IT-NB-001',
      'โน๊ตบุ๊ค',
      'Dell',
      'อุปกรณ์ไอที',
      4,
      1,
    ])
    expect(rows.find((r) => r[3] === 'รวม')?.slice(4)).toEqual([4, 1])
  })

  it('ช่วงวันที่ไม่มีความเคลื่อนไหว -> ขึ้นข้อความแทน', async () => {
    const { rows } = await readSheet(
      await movementToExcel({ ...movementReport, rows: [], totalIn: 0, totalOut: 0 }, META)
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
    const buffer = await movementToPdf(movementReport, META)
    expect(isPdf(buffer)).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('รายงานว่างก็ยังออกไฟล์ได้ ไม่ล้ม', async () => {
    expect(isPdf(await stockToPdf({ categories: [], grandTotalInStock: 0 }, META))).toBe('%PDF-')
    expect(
      isPdf(await movementToPdf({ ...movementReport, rows: [], totalIn: 0, totalOut: 0 }, META))
    ).toBe('%PDF-')
  })
})
