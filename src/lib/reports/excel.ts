import ExcelJS from 'exceljs'
import type { MovementDetailReport, OutReportDetailed, StockReportDetailed, StockReportRow } from '@/lib/scan-service'
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

const HISTORY_HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFBEB' },
}

function thaiDateTimeShort(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
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

export async function stockDetailedToExcel(report: StockReportDetailed, meta: ExportMeta): Promise<Buffer> {
  const wb = newWorkbook()
  const sheet = wb.addWorksheet('ยอดคงเหลือ-ละเอียด')
  sheet.columns = [
    { width: 14 },  // A: ประเภท/SKU
    { width: 18 },  // B: Serial/SKU
    { width: 28 },  // C: สินค้า
    { width: 14 },  // D: แบรนด์
    { width: 10 },  // E: คงเหลือ
    { width: 10 },  // F: เบิกแล้ว
    { width: 10 },  // G: สถานะ
    { width: 18 },  // H: วันที่รับเข้า
    { width: 18 },  // I: วันที่เบิกออก
    { width: 14 },  // J: ผู้จำหน่าย
    { width: 14 },  // K: ผู้ซื้อ
    { width: 14 },  // L: ประวัติ-ประเภท
    { width: 12 },  // M: ประวัติ-ผล
    { width: 22 },  // N: ประวัติ-รายละเอียด
    { width: 18 },  // O: ประวัติ-วันที่
    { width: 14 },  // P: ประวัติ-ผู้ทำ
  ]

  writeTitle(
    sheet,
    'รายงานยอดคงเหลือ (รายละเอียด)',
    `รวมคงเหลือ ${report.grandTotalInStock.toLocaleString('th-TH')} ชิ้น`,
    meta
  )

  if (report.categories.length === 0) {
    sheet.addRow(['ไม่พบสินค้าตามเงื่อนไขที่เลือก'])
    return toBuffer(wb)
  }

  for (const category of report.categories) {
    // Category heading - merge A:F
    const headingRow = sheet.addRow([
      `${category.categoryName} (${category.categoryCode}) · คงเหลือรวม ${category.totalInStock} ชิ้น`,
    ])
    headingRow.font = { bold: true, size: 12 }
    sheet.mergeCells(headingRow.number, 1, headingRow.number, 6)

    if (category.products.length === 0) {
      sheet.addRow(['ยังไม่มีสินค้าในประเภทนี้'])
      sheet.addRow([])
      continue
    }

    for (const p of category.products) {
      // Product row: A=sku, B=name, C=brand, D=inStock, E=out
      const productRow = sheet.addRow([
        p.sku,
        p.trackingType === 'QUANTITY'
          ? `${p.name} (นับจำนวน${p.unitLabel ? ` · ${p.unitLabel}` : ''})`
          : p.name,
        p.brand ?? '-',
        p.inStock,
        p.out,
      ])
      productRow.font = { bold: true }
      productRow.eachCell((cell) => {
        cell.fill = DETAIL_HEADER_FILL
      })

      if (p.serials.length === 0) {
        const noSerialRow = sheet.addRow([
          '',
          '',
          '',
          '',
          '',
          '',
          p.trackingType === 'QUANTITY' ? 'สินค้านับจำนวน (ดูยอดคงเหลือด้านบน)' : 'ไม่มี Serial Tracking',
        ])
        noSerialRow.getCell(7).font = { italic: true, color: { argb: 'FF64748B' } }
      } else {
        // Serial header: B=Serial, C=สถานะ, D=รับเข้า, E=เบิกออก, F=ผู้จำหน่าย, G=ผู้ซื้อ
        const serialHeader = sheet.addRow([
          '',
          'Serial', 'สถานะ', 'วันที่รับเข้า', 'วันที่เบิกออก', 'ผู้จำหน่าย', 'ผู้ซื้อ',
        ])
        serialHeader.font = { bold: true, size: 9 }
        serialHeader.eachCell((cell, colNumber) => {
          if (colNumber >= 2 && colNumber <= 7) cell.fill = SERIAL_HEADER_FILL
        })

        for (const s of p.serials) {
          // หาผู้ซื้อจากประวัติล่าสุดที่เป็น OUT SALE
          const buyer = s.history
            .filter((h) => h.type === 'OUT' && h.customerName)
            .pop()?.customerName ?? null

          // Serial row: B=serial, C=status, D=receivedAt, E=releasedAt, F=vendor, G=buyer
          sheet.addRow([
            '',
            s.serial,
            STATUS_LABEL[s.status] ?? s.status,
            thaiDateTimeShort(s.receivedAt),
            thaiDateTimeShort(s.releasedAt),
            s.vendorName ?? '-',
            buyer ?? '-',
          ])

          // Transaction history rows
          if (s.history.length > 0) {
            for (const h of s.history) {
              const detail = [
                h.reason ? `(${OUT_REASON_LABEL[h.reason] ?? h.reason})` : '',
                h.customerName ? `ลูกค้า: ${h.customerName}` : '',
                h.note ? `หมายเหตุ: ${h.note}` : '',
              ].filter(Boolean).join(' ')

              sheet.addRow([
                '', '',
                SCAN_TYPE_LABEL[h.type] ?? h.type,
                SCAN_RESULT_LABEL[h.result] ?? h.result,
                detail || '-',
                thaiDateTimeShort(h.at),
                h.userName,
              ])
            }
          }
        }
      }

      sheet.addRow([]) // spacing between products
    }

    // Category total
    const total = sheet.addRow([`รวม ${category.categoryName}`, '', '', '', category.totalInStock, ''])
    total.font = { bold: true }
    sheet.addRow([])
  }

  // Grand total
  const grand = sheet.addRow(['รวมทั้งหมด', '', '', '', report.grandTotalInStock, ''])
  grand.font = { bold: true }

  return toBuffer(wb)
}

export async function movementDetailedToExcel(report: MovementDetailReport, meta: ExportMeta): Promise<Buffer> {
  const wb = newWorkbook()
  const sheet = wb.addWorksheet('ความเคลื่อนไหว')
  sheet.columns = [
    { width: 18 },  // A: วันที่
    { width: 12 },  // B: รายการ
    { width: 18 },  // C: Serial
    { width: 28 },  // D: สินค้า
    { width: 14 },  // E: SKU
    { width: 14 },  // F: ผู้ซื้อ / ลูกค้า
    { width: 14 },  // G: ผู้ทำรายการ
    { width: 20 },  // H: หมายเหตุ
  ]

  writeTitle(
    sheet,
    'รายงานความเคลื่อนไหว',
    `${thaiDate(report.from)} - ${thaiDate(report.to)} · รับเข้า ${report.totalIn.toLocaleString(
      'th-TH'
    )} รายการ · เบิกออก ${report.totalOut.toLocaleString('th-TH')} รายการ`,
    meta
  )

  if (report.rows.length === 0) {
    sheet.addRow(['ช่วงวันที่นี้ไม่มีการรับเข้าหรือเบิกออก'])
    return toBuffer(wb)
  }

  const headerRow = sheet.addRow(['วันที่', 'รายการ', 'Serial', 'สินค้า', 'SKU', 'ผู้ซื้อ / ลูกค้า', 'ผู้ทำรายการ', 'หมายเหตุ'])
  styleHeader(headerRow)
  sheet.views = [{ state: 'frozen', ySplit: headerRow.number }]

  const SCAN_TYPE_LABEL: Record<string, string> = { IN: 'รับเข้า', OUT: 'เบิกออก', AUDIT: 'ตรวจนับ' }

  for (const r of report.rows) {
    const detail = [
      r.reason ? `(${r.reason})` : '',
      r.note ?? '',
    ].filter(Boolean).join(' ')

    sheet.addRow([
      thaiDateTimeShort(r.at),
      SCAN_TYPE_LABEL[r.type] ?? r.type,
      r.serial ?? (r.quantity > 1 ? `× ${r.quantity}` : '-'),
      r.productName,
      r.sku,
      r.customerName ?? '-',
      r.userName,
      detail || '-',
    ])
  }

  const total = sheet.addRow(['', '', '', '', '', '', 'รวม', `รับเข้า ${report.totalIn} · เบิกออก ${report.totalOut}`])
  total.font = { bold: true }

  return toBuffer(wb)
}

// ─────────────────────── รายงานสินค้าเบิกออก (Excel) ───────────────────────

export async function outDetailedToExcel(report: OutReportDetailed, meta: ExportMeta): Promise<Buffer> {
  const wb = newWorkbook()
  const sheet = wb.addWorksheet('สินค้าเบิกออก-ละเอียด')
  sheet.columns = [
    { width: 14 },  // A: ประเภท/SKU
    { width: 18 },  // B: Serial
    { width: 10 },  // C: สถานะ
    { width: 18 },  // D: วันที่รับเข้า
    { width: 18 },  // E: วันที่เบิกออก
    { width: 14 },  // F: ผู้จำหน่าย
    { width: 14 },  // G: ผู้ซื้อ
  ]

  writeTitle(
    sheet,
    'รายงานสินค้าเบิกออก (รายละเอียด)',
    `เบิกออกรวม ${report.grandTotalOut.toLocaleString('th-TH')} ชิ้น`,
    meta
  )

  if (report.categories.length === 0) {
    sheet.addRow(['ไม่พบสินค้าตามเงื่อนไขที่เลือก'])
    return toBuffer(wb)
  }

  for (const category of report.categories) {
    const headingRow = sheet.addRow([
      `${category.categoryName} (${category.categoryCode}) · เบิกออกรวม ${category.totalOut} ชิ้น`,
    ])
    headingRow.font = { bold: true, size: 12 }
    sheet.mergeCells(headingRow.number, 1, headingRow.number, 7)

    if (category.products.length === 0) {
      sheet.addRow(['ยังไม่มีสินค้าในประเภทนี้'])
      sheet.addRow([])
      continue
    }

    for (const p of category.products) {
      const productRow = sheet.addRow([p.sku, p.name, p.brand ?? '-', '', p.out])
      productRow.font = { bold: true }
      productRow.eachCell((cell) => { cell.fill = DETAIL_HEADER_FILL })

      if (p.serials.length === 0) {
        sheet.addRow(['', '', '', '', '', '', 'ไม่มี Serial ที่เบิกออก'])
      } else {
        const serialHeader = sheet.addRow(['', 'Serial', 'สถานะ', 'วันที่รับเข้า', 'วันที่เบิกออก', 'ผู้จำหน่าย', 'ผู้ซื้อ'])
        serialHeader.font = { bold: true, size: 9 }
        serialHeader.eachCell((cell, colNumber) => {
          if (colNumber >= 2 && colNumber <= 7) cell.fill = SERIAL_HEADER_FILL
        })

        for (const s of p.serials) {
          const buyer = s.history
            .filter((h) => h.type === 'OUT' && h.customerName)
            .pop()?.customerName ?? null

          sheet.addRow([
            '',
            s.serial,
            STATUS_LABEL[s.status] ?? s.status,
            thaiDateTimeShort(s.receivedAt),
            thaiDateTimeShort(s.releasedAt),
            s.vendorName ?? '-',
            buyer ?? '-',
          ])
        }
      }

      sheet.addRow([])
    }

    const total = sheet.addRow([`รวม ${category.categoryName}`, '', '', '', category.totalOut])
    total.font = { bold: true }
    sheet.addRow([])
  }

  const grand = sheet.addRow(['รวมทั้งหมด', '', '', '', report.grandTotalOut])
  grand.font = { bold: true }

  return toBuffer(wb)
}
