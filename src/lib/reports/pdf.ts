import PdfPrinter from 'pdfmake'
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { MovementReport, StockReportRow } from '@/lib/scan-service'
import { filterSummary, thaiDate, thaiDateTime, type ExportMeta } from './common'
import { SARABUN_BOLD_BASE64, SARABUN_REGULAR_BASE64 } from './sarabun-font'

type StockReport = { categories: StockReportRow[]; grandTotalInStock: number }

// ฟอนต์มาตรฐาน 14 ตัวของ PDF ไม่มีสระ/วรรณยุกต์ไทย จึงต้องฝัง Sarabun ไปกับไฟล์
// pdfmake ส่ง Buffer ต่อให้ pdfkit ตรงๆ โดยไม่แตะดิสก์ ทำให้ standalone build ไม่พัง
let printer: PdfPrinter | undefined

function getPrinter(): PdfPrinter {
  if (!printer) {
    const regular = Buffer.from(SARABUN_REGULAR_BASE64, 'base64')
    const bold = Buffer.from(SARABUN_BOLD_BASE64, 'base64')
    printer = new PdfPrinter({
      Sarabun: { normal: regular, bold, italics: regular, bolditalics: bold },
    })
  }
  return printer
}

function render(content: Content[]): Promise<Buffer> {
  const definition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 28, 28, 28],
    defaultStyle: { font: 'Sarabun', fontSize: 9 },
    styles: {
      title: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
      subtitle: { fontSize: 10, color: '#475569' },
      meta: { fontSize: 8, color: '#64748b', margin: [0, 0, 0, 10] },
      section: { fontSize: 11, bold: true, margin: [0, 12, 0, 4] },
      th: { bold: true, fillColor: '#f1f5f9' },
      empty: { color: '#64748b', italics: true },
    },
    content,
  }

  const doc = getPrinter().createPdfKitDocument(definition)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

function header(title: string, subtitle: string, meta: ExportMeta): Content[] {
  return [
    { text: title, style: 'title' },
    { text: subtitle, style: 'subtitle' },
    {
      text: `ตัวกรอง: ${filterSummary(meta)} · ออกรายงานเมื่อ ${thaiDateTime(
        meta.generatedAt ?? new Date()
      )}`,
      style: 'meta',
    },
  ]
}

const TABLE_LAYOUT = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0,
  hLineColor: () => '#e2e8f0',
  paddingTop: () => 4,
  paddingBottom: () => 4,
}

const num = (value: number): TableCell => ({ text: String(value), alignment: 'right' })
const th = (text: string, right = false): TableCell => ({
  text,
  style: 'th',
  alignment: right ? 'right' : 'left',
})

export function stockToPdf(report: StockReport, meta: ExportMeta): Promise<Buffer> {
  const content: Content[] = header(
    'รายงานยอดคงเหลือ',
    `รวมคงเหลือ ${report.grandTotalInStock.toLocaleString('th-TH')} ชิ้น`,
    meta
  )

  if (report.categories.length === 0) {
    content.push({ text: 'ไม่พบสินค้าตามเงื่อนไขที่เลือก', style: 'empty' })
    return render(content)
  }

  for (const category of report.categories) {
    content.push({
      text: `${category.categoryName} (${category.categoryCode}) · คงเหลือรวม ${category.totalInStock} ชิ้น`,
      style: 'section',
    })

    if (category.products.length === 0) {
      content.push({ text: 'ยังไม่มีสินค้าในประเภทนี้', style: 'empty' })
      continue
    }

    content.push({
      table: {
        headerRows: 1,
        widths: [80, '*', 90, 55, 70],
        body: [
          [th('SKU'), th('สินค้า'), th('แบรนด์'), th('คงเหลือ', true), th('เบิกออกไปแล้ว', true)],
          ...category.products.map((p): TableCell[] => [
            p.sku,
            p.name,
            p.brand ?? '-',
            num(p.inStock),
            num(p.out),
          ]),
        ],
      },
      layout: TABLE_LAYOUT,
    })
  }

  content.push({
    text: `รวมทั้งหมด ${report.grandTotalInStock.toLocaleString('th-TH')} ชิ้น`,
    style: 'section',
    alignment: 'right',
  })

  return render(content)
}

export function movementToPdf(report: MovementReport, meta: ExportMeta): Promise<Buffer> {
  const content: Content[] = header(
    'รายงานความเคลื่อนไหว',
    `${thaiDate(report.from)} - ${thaiDate(report.to)} · รับเข้า ${report.totalIn.toLocaleString(
      'th-TH'
    )} ชิ้น · เบิกออก ${report.totalOut.toLocaleString('th-TH')} ชิ้น`,
    meta
  )

  if (report.rows.length === 0) {
    content.push({ text: 'ช่วงวันที่นี้ไม่มีการรับเข้าหรือเบิกออก', style: 'empty' })
    return render(content)
  }

  content.push({
    table: {
      headerRows: 1,
      widths: [80, '*', 90, 110, 50, 50],
      body: [
        [
          th('SKU'),
          th('สินค้า'),
          th('แบรนด์'),
          th('ประเภทของ'),
          th('รับเข้า', true),
          th('เบิกออก', true),
        ],
        ...report.rows.map((r): TableCell[] => [
          r.sku,
          r.name,
          r.brand ?? '-',
          r.categoryName,
          num(r.inCount),
          num(r.outCount),
        ]),
        [
          { text: 'รวม', colSpan: 4, bold: true },
          {},
          {},
          {},
          { text: String(report.totalIn), alignment: 'right', bold: true },
          { text: String(report.totalOut), alignment: 'right', bold: true },
        ],
      ],
    },
    layout: TABLE_LAYOUT,
  })

  return render(content)
}
