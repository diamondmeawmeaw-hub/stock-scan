import { prisma } from '@/lib/prisma'
import { dayRange, todayInThailand, type TimePeriod } from '@/lib/date-range'
import {
  buildMovementDetail,
  buildOutReportDetailed,
  buildSalesReport,
  buildStockReportDetailed,
  type SalesReportFilters,
  type StockReportFilters,
} from '@/lib/scan-service'
import type { ExportMeta } from '@/lib/reports/common'
import {
  movementDetailedToExcel,
  outDetailedToExcel,
  salesToExcel,
  stockDetailedToExcel,
} from '@/lib/reports/excel'
import {
  movementDetailedToPdf,
  outDetailedToPdf,
  salesToPdf,
  stockDetailedToPdf,
} from '@/lib/reports/pdf'
import {
  EXPORT_CONTENT_TYPES,
  type ReportExportInput,
  type SalesExportInput,
  type ExportRequest,
} from './schema'

export type ExportFile = {
  buffer: Buffer
  fileName: string
  contentType: string
}

export function stockFiltersFromInput(input: ReportExportInput): StockReportFilters {
  return {
    categoryId: input.categoryId,
    brand: input.brand,
    vendorId: input.vendorId,
    q: input.q,
    customerId: input.customerId,
    timePeriod: (input.timePeriod || 'all') as TimePeriod,
  }
}

export function movementRangeFromInput(input: ReportExportInput): {
  filters: StockReportFilters
  from: Date
  to: Date
} {
  return {
    filters: {
      categoryId: input.categoryId,
      brand: input.brand,
      vendorId: input.vendorId,
      q: input.q,
      customerId: input.customerId,
    },
    ...dayRange(input.from!, input.to!),
  }
}

export function salesFiltersFromInput(input: SalesExportInput): SalesReportFilters {
  if (!input.from && !input.to) {
    return { customerId: input.customerId, projectId: input.projectId, q: input.q }
  }

  // เลือกวันเดียว = เฉพาะวันนั้น (พฤติกรรมเดิมของหน้าขาย)
  const start = input.from || input.to!
  const end = input.to || input.from!
  const [from, to] = start <= end ? [start, end] : [end, start]
  const range = dayRange(from, to)
  return {
    customerId: input.customerId,
    projectId: input.projectId,
    q: input.q,
    from: range.from,
    to: range.to,
  }
}

/** สร้างไฟล์แบบโหลดเข้าหน่วยความจำ - ใช้กับ export ปกติและไฟล์ PDF */
export async function buildSmallExport(
  input: ExportRequest,
  generatedAt = new Date()
): Promise<ExportFile> {
  if (input.type === 'sales') {
    const filters = salesFiltersFromInput(input)
    const report = await buildSalesReport(filters)
    const meta = await describeSalesFilters(input, generatedAt)
    const buffer =
      input.format === 'xlsx' ? await salesToExcel(report, meta) : await salesToPdf(report, meta)
    return fileResult(buffer, 'ประวัติการขาย', input.format, generatedAt)
  }

  if (input.view === 'movement') {
    const { filters, from, to } = movementRangeFromInput(input)
    const report = await buildMovementDetail({ ...filters, from, to })
    const meta = await describeMovementFilters(input, generatedAt)
    const buffer =
      input.format === 'xlsx'
        ? await movementDetailedToExcel(report, meta)
        : await movementDetailedToPdf(report, meta)
    return fileResult(buffer, 'ความเคลื่อนไหว', input.format, generatedAt)
  }

  const filters = stockFiltersFromInput(input)
  const meta = await describeStockFilters(filters, generatedAt)
  if (input.view === 'stock') {
    const report = await buildStockReportDetailed(filters)
    const buffer =
      input.format === 'xlsx' ? await stockDetailedToExcel(report, meta) : await stockDetailedToPdf(report, meta)
    return fileResult(buffer, 'ยอดคงเหลือ', input.format, generatedAt)
  }

  const report = await buildOutReportDetailed(filters)
  const buffer =
    input.format === 'xlsx' ? await outDetailedToExcel(report, meta) : await outDetailedToPdf(report, meta)
  return fileResult(buffer, 'สินค้าเบิกออก', input.format, generatedAt)
}

function fileResult(
  buffer: Buffer,
  title: string,
  format: 'xlsx' | 'pdf',
  generatedAt: Date
): ExportFile {
  return {
    buffer,
    fileName: exportFileName(title, format, generatedAt),
    contentType: EXPORT_CONTENT_TYPES[format],
  }
}

/** ชื่อไฟล์ที่ผู้ใช้เห็นตอนดาวน์โหลด */
export function exportFileName(
  title: string,
  format: 'xlsx' | 'pdf',
  generatedAt = new Date()
): string {
  return `${title}-${todayInThailand(generatedAt)}.${format}`
}

/** ชื่อรายงานตามประเภทรายการ export */
export function exportTitle(input: ExportRequest): string {
  if (input.type === 'sales') return 'ประวัติการขาย'
  if (input.view === 'movement') return 'ความเคลื่อนไหว'
  return input.view === 'stock' ? 'ยอดคงเหลือ' : 'สินค้าเบิกออก'
}

/** แปลง id ของตัวกรองเป็นชื่อที่คนอ่านรู้เรื่อง สำหรับใส่หัวรายงาน (Stock) */
export async function describeStockFilters(
  filters: StockReportFilters,
  generatedAt?: Date
): Promise<ExportMeta> {
  const [category, vendor, customer] = await Promise.all([
    filters.categoryId
      ? prisma.category.findUnique({ where: { id: filters.categoryId }, select: { name: true } })
      : null,
    filters.vendorId
      ? prisma.vendor.findUnique({ where: { id: filters.vendorId }, select: { name: true } })
      : null,
    filters.customerId
      ? prisma.customer.findUnique({ where: { id: filters.customerId }, select: { name: true } })
      : null,
  ])
  return {
    categoryName: category?.name ?? null,
    brand: filters.brand,
    vendorName: vendor?.name ?? null,
    customerName: customer?.name ?? null,
    timePeriod: filters.timePeriod,
    q: filters.q,
    generatedAt,
  }
}

/** แปลง id ของตัวกรองเป็นชื่อที่คนอ่านรู้เรื่อง สำหรับใส่หัวรายงาน (Movement) */
export async function describeMovementFilters(
  filters: Pick<StockReportFilters, 'categoryId' | 'brand' | 'vendorId' | 'q' | 'customerId'>,
  generatedAt?: Date
): Promise<ExportMeta> {
  const [category, vendor, customer] = await Promise.all([
    filters.categoryId
      ? prisma.category.findUnique({ where: { id: filters.categoryId }, select: { name: true } })
      : null,
    filters.vendorId
      ? prisma.vendor.findUnique({ where: { id: filters.vendorId }, select: { name: true } })
      : null,
    filters.customerId
      ? prisma.customer.findUnique({ where: { id: filters.customerId }, select: { name: true } })
      : null,
  ])
  return {
    categoryName: category?.name ?? null,
    brand: filters.brand,
    vendorName: vendor?.name ?? null,
    customerName: customer?.name ?? null,
    q: filters.q,
    generatedAt,
  }
}

export async function describeSalesFilters(
  input: SalesExportInput,
  generatedAt?: Date
): Promise<ExportMeta> {
  const [customer, project] = await Promise.all([
    input.customerId
      ? prisma.customer.findUnique({ where: { id: input.customerId }, select: { name: true } })
      : null,
    input.projectId
      ? prisma.project.findUnique({ where: { id: input.projectId }, select: { name: true } })
      : null,
  ])
  return {
    customerName: customer?.name ?? null,
    projectName: project?.name ?? null,
    q: input.q,
    generatedAt,
  }
}
