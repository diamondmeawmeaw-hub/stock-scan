import ExcelJS from 'exceljs'
import type { MovementReport, StockReportRow } from '@/lib/scan-service'
import { filterSummary, thaiDate, thaiDateTime, type ExportMeta } from './common'

type StockReport = { categories: StockReportRow[]; grandTotalInStock: number }

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF1F5F9' },
}

function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Stock Scan'
  return wb
}

/** หัวรายงาน 3 บรรทัดบนสุดของชีต คืนเลขแถวถัดไปที่ว่าง */
function writeTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string, meta: ExportMeta) {
  sheet.addRow([title]).font = { bold: true, size: 14 }
  sheet.addRow([subtitle])
  sheet.addRow([`ตัวกรอง: ${filterSummary(meta)}`])
  sheet.addRow([`ออกรายงานเมื่อ ${thaiDateTime(meta.generatedAt ?? new Date())}`])
  sheet.addRow([])
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true }
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL
  })
}

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export async function stockToExcel(report: StockReport, meta: ExportMeta): Promise<Buffer> {
  const wb = newWorkbook()
  const sheet = wb.addWorksheet('ยอดคงเหลือ')
  sheet.columns = [
    { width: 16 },
    { width: 34 },
    { width: 16 },
    { width: 12 },
    { width: 16 },
  ]

  writeTitle(
    sheet,
    'รายงานยอดคงเหลือ',
    `รวมคงเหลือ ${report.grandTotalInStock.toLocaleString('th-TH')} ชิ้น`,
    meta
  )

  if (report.categories.length === 0) {
    sheet.addRow(['ไม่พบสินค้าตามเงื่อนไขที่เลือก'])
    return toBuffer(wb)
  }

  for (const category of report.categories) {
    const heading = sheet.addRow([`${category.categoryName} (${category.categoryCode})`])
    heading.font = { bold: true, size: 12 }
    styleHeader(sheet.addRow(['SKU', 'สินค้า', 'แบรนด์', 'คงเหลือ', 'เบิกออกไปแล้ว']))

    for (const p of category.products) {
      sheet.addRow([p.sku, p.name, p.brand ?? '-', p.inStock, p.out])
    }
    if (category.products.length === 0) {
      sheet.addRow(['ยังไม่มีสินค้าในประเภทนี้'])
    }

    const total = sheet.addRow(['', '', 'รวมประเภทนี้', category.totalInStock, ''])
    total.font = { bold: true }
    sheet.addRow([])
  }

  const grand = sheet.addRow(['', '', 'รวมทั้งหมด', report.grandTotalInStock, ''])
  grand.font = { bold: true }

  return toBuffer(wb)
}

export async function movementToExcel(report: MovementReport, meta: ExportMeta): Promise<Buffer> {
  const wb = newWorkbook()
  const sheet = wb.addWorksheet('ความเคลื่อนไหว')
  sheet.columns = [
    { width: 16 },
    { width: 34 },
    { width: 16 },
    { width: 20 },
    { width: 10 },
    { width: 10 },
  ]

  writeTitle(
    sheet,
    'รายงานความเคลื่อนไหว',
    `${thaiDate(report.from)} - ${thaiDate(report.to)} · รับเข้า ${report.totalIn.toLocaleString(
      'th-TH'
    )} ชิ้น · เบิกออก ${report.totalOut.toLocaleString('th-TH')} ชิ้น`,
    meta
  )

  const headerRow = sheet.addRow(['SKU', 'สินค้า', 'แบรนด์', 'ประเภทของ', 'รับเข้า', 'เบิกออก'])
  styleHeader(headerRow)
  sheet.views = [{ state: 'frozen', ySplit: headerRow.number }]

  if (report.rows.length === 0) {
    sheet.addRow(['ช่วงวันที่นี้ไม่มีการรับเข้าหรือเบิกออก'])
    return toBuffer(wb)
  }

  for (const r of report.rows) {
    sheet.addRow([r.sku, r.name, r.brand ?? '-', r.categoryName, r.inCount, r.outCount])
  }

  const total = sheet.addRow(['', '', '', 'รวม', report.totalIn, report.totalOut])
  total.font = { bold: true }

  return toBuffer(wb)
}
