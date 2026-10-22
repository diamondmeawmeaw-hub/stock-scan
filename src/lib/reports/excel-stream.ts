import ExcelJS from 'exceljs'
import { prisma } from '@/lib/prisma'
import {
  buildStockReportDetailed,
  buildOutReportDetailed,
  countSalesReport,
  exportRowLimit,
  isExportLimitError,
  iterateMovementDetailRows,
  iterateSalesReportRows,
  movementDetailTotals,
  productFilter,
  type OutReportDetailedRow,
  type SalesReportFilters,
  type StockReportDetailedRow,
  type StockReportFilters,
} from '@/lib/scan-service'
import { filterSummary, thaiDate, thaiDateTime, type ExportMeta } from './common'

const DETAIL_HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFEFF6FF' },
}
const SERIAL_HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF0FDF4' },
}
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF1F5F9' },
}

const SCAN_TYPE_LABEL: Record<string, string> = { IN: 'รับเข้า', OUT: 'เบิกออก', AUDIT: 'ตรวจนับ' }
const SCAN_RESULT_LABEL: Record<string, string> = {
  CREATED: 'สร้างใหม่',
  RETURNED: 'รับกลับ',
  DUPLICATE: 'ซ้ำ',
  PRODUCT_MISMATCH: 'สินค้าไม่ตรง',
  OK: 'สำเร็จ',
  ALREADY_OUT: 'เบิกแล้ว',
  UNKNOWN_SERIAL: 'ไม่รู้จัก',
  NOT_IN_SCOPE: 'นอกรอบ',
  FOUND_BUT_OUT: 'เจอแต่เบิกแล้ว',
  MISSING: 'ของหาย',
}
const OUT_REASON_LABEL: Record<string, string> = {
  SALE: 'ขาย',
  INTERNAL_USE: 'ใช้ภายใน',
  DAMAGED: 'ชำรุด',
  RETURN_SUPPLIER: 'ส่งคืน',
  OTHER: 'อื่นๆ',
}
const STATUS_LABEL: Record<string, string> = { IN_STOCK: 'ในคลัง', OUT: 'เบิกแล้ว' }

function newWorkbook(filename: string): ExcelJS.stream.xlsx.WorkbookWriter {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename,
    useStyles: true,
    // ไฟล์ใหญ่ไม่ต้องใช้ shared strings - ลด memory และเขียนต่อเนื่องได้
    useSharedStrings: false,
  })
  wb.creator = 'Stock Scan'
  return wb
}

function thaiDateTimeShort(iso: string | null): string {
  if (!iso) return '-'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '-'
  return at.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

type CellValue = string | number | null

/** เพิ่มแถวแล้ว commit ทันที เพื่อให้ ExcelJS streaming writer ปล่อย memory ระหว่างทาง */
function addRow(
  sheet: ExcelJS.Worksheet,
  values: CellValue[],
  style?: (row: ExcelJS.Row) => void
): ExcelJS.Row {
  const row = sheet.addRow(values)
  style?.(row)
  row.commit()
  return row
}

function writeTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string, meta: ExportMeta) {
  addRow(sheet, [title], (row) => {
    row.font = { bold: true, size: 14 }
  })
  addRow(sheet, [subtitle])
  addRow(sheet, [`ตัวกรอง: ${filterSummary(meta)}`])
  addRow(sheet, [`ออกรายงานเมื่อ ${thaiDateTime(meta.generatedAt ?? new Date())}`])
  addRow(sheet, [])
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true }
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL
  })
}

function appendStockCategory(
  sheet: ExcelJS.Worksheet,
  category: StockReportDetailedRow,
  options: { heading: boolean; total: boolean }
) {
  if (options.heading) {
    addRow(
      sheet,
      [`${category.categoryName} (${category.categoryCode}) · คงเหลือรวม ${category.totalInStock} ชิ้น`],
      (row) => {
        row.font = { bold: true, size: 12 }
      }
    )
  }

  for (const p of category.products) {
    addRow(sheet, [p.sku, p.trackingType === 'QUANTITY'
      ? `${p.name} (นับจำนวน${p.unitLabel ? ` · ${p.unitLabel}` : ''})`
      : p.name, p.brand ?? '-', p.vendorName ?? 'ไม่ระบุ', p.inStock, p.out], (row) => {
      row.font = { bold: true }
      row.eachCell((cell) => {
        cell.fill = DETAIL_HEADER_FILL
      })
    })

    if (p.serials.length === 0) {
      addRow(
        sheet,
        ['', '', '', '', '', '', p.trackingType === 'QUANTITY' ? 'สินค้านับจำนวน (ดูยอดคงเหลือด้านบน)' : 'ไม่มี Serial Tracking'],
        (row) => {
          row.getCell(7).font = { italic: true, color: { argb: 'FF64748B' } }
        }
      )
    } else {
      addRow(sheet, ['', 'Serial', 'สถานะ', 'วันที่รับเข้า', 'วันที่เบิกออก', 'ผู้จำหน่าย', 'ผู้ซื้อ'], (row) => {
        row.font = { bold: true, size: 9 }
        row.eachCell((cell, colNumber) => {
          if (colNumber >= 2 && colNumber <= 7) cell.fill = SERIAL_HEADER_FILL
        })
      })

      for (const s of p.serials) {
        const buyer = s.history.filter((h) => h.type === 'OUT' && h.customerName).pop()?.customerName ?? null
        addRow(sheet, [
          '',
          s.serial,
          STATUS_LABEL[s.status] ?? s.status,
          thaiDateTimeShort(s.receivedAt),
          thaiDateTimeShort(s.releasedAt),
          s.vendorName ?? '-',
          buyer ?? '-',
        ])

        for (const h of s.history) {
          const detail = [
            h.reason ? `(${OUT_REASON_LABEL[h.reason] ?? h.reason})` : '',
            h.customerName ? `ลูกค้า: ${h.customerName}` : '',
            h.note ? `หมายเหตุ: ${h.note}` : '',
          ].filter(Boolean).join(' ')
          addRow(sheet, [
            '', '', SCAN_TYPE_LABEL[h.type] ?? h.type,
            SCAN_RESULT_LABEL[h.result] ?? h.result,
            detail || '-', thaiDateTimeShort(h.at), h.userName,
          ])
        }
      }
    }

    addRow(sheet, [])
  }

  if (options.total) {
    addRow(sheet, [`รวม ${category.categoryName}`, '', '', '', category.totalInStock, ''], (row) => {
      row.font = { bold: true }
    })
    addRow(sheet, [])
  }
}

async function streamStockCategoryByProduct(
  sheet: ExcelJS.Worksheet,
  filters: StockReportFilters,
  category: { id: string; name: string }
): Promise<{ total: number; wrote: boolean }> {
  const base = productFilter({ ...filters, categoryId: null, productId: null })
  const products = await prisma.product.findMany({
    where: base ? { AND: [{ categoryId: category.id }, base] } : { categoryId: category.id },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  let first = true
  let total = 0
  for (const product of products) {
    let report
    try {
      report = await buildStockReportDetailed({
        ...filters,
        categoryId: category.id,
        productId: product.id,
      })
    } catch (err) {
      if (isExportLimitError(err)) {
        throw new Error(
          `สินค้า "${product.name}" มีข้อมูลเกิน ${exportRowLimit().toLocaleString('th-TH')} แถว ` +
            'จึงแบ่งไฟล์อัตโนมัติไม่ได้ กรุณากรองแบรนด์หรือช่วงเวลาให้แคบลง'
        )
      }
      throw err
    }

    const chunk = report.categories[0]
    if (!chunk) continue
    appendStockCategory(sheet, chunk, { heading: first, total: false })
    first = false
    total += chunk.totalInStock
  }

  if (!first) {
    addRow(sheet, [`รวม ${category.name}`, '', '', '', total, ''], (row) => {
      row.font = { bold: true }
    })
    addRow(sheet, [])
  }
  return { total, wrote: !first }
}

/** เขียนรายงานคงเหลือแบบละเอียดเป็น XLSX โดยไม่โหลดทุกแถวพร้อมกัน */
export async function streamStockDetailedToXlsx(
  filters: StockReportFilters,
  meta: ExportMeta,
  filename: string
): Promise<void> {
  const wb = newWorkbook(filename)
  const sheet = wb.addWorksheet('ยอดคงเหลือ-ละเอียด')
  sheet.columns = [
    { width: 14 }, { width: 18 }, { width: 28 }, { width: 14 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 12 }, { width: 22 }, { width: 18 }, { width: 14 },
  ]

  writeTitle(sheet, 'รายงานยอดคงเหลือ (รายละเอียด)', 'ไฟล์ขนาดใหญ่ - แสดงรายการตาม Serial', meta)

  const base = productFilter(filters)
  const categories = await prisma.category.findMany({
    where: base ? { products: { some: base } } : undefined,
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  })

  let grandTotal = 0
  let wroteAny = false
  for (const category of categories) {
    let report
    try {
      report = await buildStockReportDetailed({
        ...filters,
        categoryId: category.id,
        productId: null,
      })
    } catch (err) {
      if (!isExportLimitError(err)) throw err
      const chunk = await streamStockCategoryByProduct(sheet, filters, category)
      grandTotal += chunk.total
      wroteAny = wroteAny || chunk.wrote
      continue
    }

    const chunk = report.categories[0]
    if (!chunk) continue
    appendStockCategory(sheet, chunk, { heading: true, total: true })
    grandTotal += chunk.totalInStock
    wroteAny = true
  }

  if (!wroteAny) addRow(sheet, ['ไม่พบสินค้าตามเงื่อนไขที่เลือก'])
  addRow(sheet, ['รวมทั้งหมด', '', '', '', grandTotal, ''], (row) => {
    row.font = { bold: true }
  })

  await wb.commit()
}

function appendOutCategory(
  sheet: ExcelJS.Worksheet,
  category: OutReportDetailedRow,
  options: { heading: boolean; total: boolean }
) {
  if (options.heading) {
    addRow(
      sheet,
      [`${category.categoryName} (${category.categoryCode}) · เบิกออกรวม ${category.totalOut} ชิ้น`],
      (row) => {
        row.font = { bold: true, size: 12 }
      }
    )
  }

  for (const p of category.products) {
    addRow(sheet, [p.sku, p.name, p.brand ?? '-', '', p.out], (row) => {
      row.font = { bold: true }
      row.eachCell((cell) => {
        cell.fill = DETAIL_HEADER_FILL
      })
    })

    if (p.serials.length === 0) {
      addRow(sheet, ['', '', '', '', '', '', 'ไม่มี Serial ที่เบิกออก'])
    } else {
      addRow(sheet, ['', 'Serial', 'สถานะ', 'วันที่รับเข้า', 'วันที่เบิกออก', 'ผู้จำหน่าย', 'ผู้ซื้อ'], (row) => {
        row.font = { bold: true, size: 9 }
        row.eachCell((cell, colNumber) => {
          if (colNumber >= 2 && colNumber <= 7) cell.fill = SERIAL_HEADER_FILL
        })
      })

      for (const s of p.serials) {
        const buyer = s.history.filter((h) => h.type === 'OUT' && h.customerName).pop()?.customerName ?? null
        addRow(sheet, [
          '', s.serial, STATUS_LABEL[s.status] ?? s.status,
          thaiDateTimeShort(s.receivedAt), thaiDateTimeShort(s.releasedAt),
          s.vendorName ?? '-', buyer ?? '-',
        ])
      }
    }
    addRow(sheet, [])
  }

  if (options.total) {
    addRow(sheet, [`รวม ${category.categoryName}`, '', '', '', category.totalOut], (row) => {
      row.font = { bold: true }
    })
    addRow(sheet, [])
  }
}

async function streamOutCategoryByProduct(
  sheet: ExcelJS.Worksheet,
  filters: StockReportFilters,
  category: { id: string; name: string }
): Promise<number> {
  const base = productFilter({ ...filters, categoryId: null, productId: null })
  const products = await prisma.product.findMany({
    where: base ? { AND: [{ categoryId: category.id }, base] } : { categoryId: category.id },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  let first = true
  let total = 0
  for (const product of products) {
    let report
    try {
      report = await buildOutReportDetailed({
        ...filters,
        categoryId: category.id,
        productId: product.id,
      })
    } catch (err) {
      if (isExportLimitError(err)) {
        throw new Error(
          `สินค้า "${product.name}" มีข้อมูลเกิน ${exportRowLimit().toLocaleString('th-TH')} แถว ` +
            'จึงแบ่งไฟล์อัตโนมัติไม่ได้ กรุณากรองแบรนด์หรือช่วงเวลาให้แคบลง'
        )
      }
      throw err
    }

    const chunk = report.categories[0]
    if (!chunk) continue
    appendOutCategory(sheet, chunk, { heading: first, total: false })
    first = false
    total += chunk.totalOut
  }

  if (!first) {
    addRow(sheet, [`รวม ${category.name}`, '', '', '', total], (row) => {
      row.font = { bold: true }
    })
    addRow(sheet, [])
  }
  return total
}

/** เขียนรายงานสินค้าเบิกออกแบบละเอียดเป็น XLSX โดยไม่โหลดทุกแถวพร้อมกัน */
export async function streamOutDetailedToXlsx(
  filters: StockReportFilters,
  meta: ExportMeta,
  filename: string
): Promise<void> {
  const wb = newWorkbook(filename)
  const sheet = wb.addWorksheet('สินค้าเบิกออก-ละเอียด')
  sheet.columns = [
    { width: 14 }, { width: 18 }, { width: 10 }, { width: 18 },
    { width: 18 }, { width: 14 }, { width: 14 },
  ]

  writeTitle(sheet, 'รายงานสินค้าเบิกออก (รายละเอียด)', 'ไฟล์ขนาดใหญ่ - แสดงรายการตาม Serial', meta)

  const base = productFilter(filters)
  const categories = await prisma.category.findMany({
    where: base ? { products: { some: base } } : undefined,
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  })

  let grandTotal = 0
  let wroteAny = false
  for (const category of categories) {
    let report
    try {
      report = await buildOutReportDetailed({
        ...filters,
        categoryId: category.id,
        productId: null,
      })
    } catch (err) {
      if (!isExportLimitError(err)) throw err
      const total = await streamOutCategoryByProduct(sheet, filters, category)
      grandTotal += total
      wroteAny = wroteAny || total > 0
      continue
    }

    const chunk = report.categories[0]
    if (!chunk) continue
    appendOutCategory(sheet, chunk, { heading: true, total: true })
    grandTotal += chunk.totalOut
    wroteAny = true
  }

  if (!wroteAny) addRow(sheet, ['ไม่พบสินค้าตามเงื่อนไขที่เลือก'])
  addRow(sheet, ['รวมทั้งหมด', '', '', '', grandTotal], (row) => {
    row.font = { bold: true }
  })

  await wb.commit()
}

/** เขียนรายงานความเคลื่อนไหวเป็น XLSX แบบไล่อ่านทีละหน้า */
export async function streamMovementToXlsx(
  input: StockReportFilters & { from: Date; to: Date },
  meta: ExportMeta,
  filename: string
): Promise<void> {
  const totals = await movementDetailTotals(input)
  const wb = newWorkbook(filename)
  const sheet = wb.addWorksheet('ความเคลื่อนไหว')
  sheet.columns = [
    { width: 18 }, { width: 12 }, { width: 18 }, { width: 28 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 20 },
  ]

  writeTitle(
    sheet,
    'รายงานความเคลื่อนไหว',
    `${thaiDate(input.from.toISOString())} - ${thaiDate(input.to.toISOString())} · รับเข้า ${totals.totalIn.toLocaleString('th-TH')} รายการ · เบิกออก ${totals.totalOut.toLocaleString('th-TH')} รายการ`,
    meta
  )

  if (totals.totalRows === 0) {
    addRow(sheet, ['ช่วงวันที่นี้ไม่มีการรับเข้าหรือเบิกออก'])
    await wb.commit()
    return
  }

  addRow(sheet, ['วันที่', 'รายการ', 'Serial', 'สินค้า', 'SKU', 'ผู้ซื้อ / ลูกค้า', 'ผู้ทำรายการ', 'หมายเหตุ'], styleHeader)

  for await (const r of iterateMovementDetailRows(input)) {
    addRow(sheet, [
      thaiDateTimeShort(r.at),
      SCAN_TYPE_LABEL[r.type] ?? r.type,
      r.serial ?? (r.quantity > 1 ? `× ${r.quantity}` : '-'),
      r.productName,
      r.sku,
      r.customerName ?? '-',
      r.userName,
      [r.reason ? `(${r.reason})` : '', r.note ?? ''].filter(Boolean).join(' ') || '-',
    ])
  }

  addRow(sheet, ['', '', '', '', '', '', 'รวม', `รับเข้า ${totals.totalIn} · เบิกออก ${totals.totalOut}`], (row) => {
    row.font = { bold: true }
  })
  await wb.commit()
}

/** เขียนประวัติการขายเป็น XLSX แบบไล่อ่านทีละหน้า */
export async function streamSalesToXlsx(
  filters: SalesReportFilters,
  meta: ExportMeta,
  filename: string
): Promise<void> {
  const total = await countSalesReport(filters)
  const wb = newWorkbook(filename)
  const sheet = wb.addWorksheet('ประวัติการขาย')
  sheet.columns = [
    { width: 18 }, { width: 22 }, { width: 20 }, { width: 18 }, { width: 28 },
    { width: 10 }, { width: 14 }, { width: 22 }, { width: 12 },
  ]

  writeTitle(
    sheet,
    'รายงานประวัติการขาย',
    `ขายทั้งหมด ${total.toLocaleString('th-TH')} รายการ`,
    meta
  )

  if (total === 0) {
    addRow(sheet, ['ไม่มีประวัติการขายตามเงื่อนไขที่เลือก'])
    await wb.commit()
    return
  }

  addRow(sheet, ['เวลา', 'ลูกค้า', 'โปรเจค', 'Serial', 'สินค้า', 'จำนวน', 'ผู้ทำรายการ', 'หมายเหตุ', 'สถานะ'], styleHeader)

  for await (const r of iterateSalesReportRows(filters)) {
    addRow(sheet, [
      thaiDateTimeShort(r.at),
      r.customerName ?? '-',
      r.projectName ?? '-',
      r.serial ?? '-',
      r.sku ? `${r.productName} (${r.sku})` : r.productName,
      r.quantity,
      r.userName,
      r.note ?? '-',
      r.reversed ? 'คืนแล้ว' : 'ขาย',
    ])
  }

  addRow(sheet, ['', '', '', '', '', '', 'รวม', `${total} รายการ`, ''], (row) => {
    row.font = { bold: true }
  })
  await wb.commit()
}
