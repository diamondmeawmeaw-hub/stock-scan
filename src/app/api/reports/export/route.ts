import { z } from 'zod'
import { fileRoute } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { dayRange, todayInThailand, type TimePeriod } from '@/lib/date-range'
import { buildMovementDetail, buildOutReportDetailed, buildStockReportDetailed } from '@/lib/scan-service'
import type { ExportMeta } from '@/lib/reports/common'
import { movementDetailedToExcel, outDetailedToExcel, stockDetailedToExcel } from '@/lib/reports/excel'
import { movementDetailedToPdf, outDetailedToPdf, stockDetailedToPdf } from '@/lib/reports/pdf'

// pdfmake/exceljs ต้องรันบน Node ไม่ใช่ Edge runtime
export const runtime = 'nodejs'

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')

const querySchema = z
  .object({
    view: z.enum(['stock', 'movement', 'out'], { message: 'ประเภทรายงานต้องเป็น stock, movement, หรือ out' }),
    format: z.enum(['xlsx', 'pdf'], { message: 'รูปแบบไฟล์ต้องเป็น xlsx หรือ pdf' }),
    categoryId: z.string().nullable(),
    brand: z.string().nullable(),
    vendorId: z.string().nullable(),
    q: z.string().nullable(),
    customerId: z.string().nullable(),
    timePeriod: z.string().nullable(),
    from: DATE.optional(),
    to: DATE.optional(),
  })
  .refine((v) => v.view !== 'movement' || (v.from && v.to), {
    message: 'รายงานความเคลื่อนไหวต้องระบุช่วงวันที่',
  })

const CONTENT_TYPE = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}

export async function GET(request: Request) {
  return fileRoute(async () => {
    await requireUser()
    const params = new URL(request.url).searchParams
    const input = querySchema.parse({
      view: params.get('view') ?? 'stock',
      format: params.get('format') ?? '',
      categoryId: params.get('categoryId'),
      brand: params.get('brand'),
      vendorId: params.get('vendorId'),
      q: params.get('q'),
      customerId: params.get('customerId'),
      timePeriod: params.get('timePeriod'),
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    })

    const [buffer, title] =
      input.view === 'stock'
        ? await buildStock(input as typeof input & { view: 'stock' }, input.format)
        : input.view === 'out'
        ? await buildOut(input as typeof input & { view: 'out' }, input.format)
        : await buildMovement(input as typeof input & { view: 'movement' }, input.format)

    const filename = `${title}-${todayInThailand()}.${input.format}`
    return new Response(new Uint8Array(buffer), {
      headers: {
        'content-type': CONTENT_TYPE[input.format],
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'cache-control': 'no-store',
      },
    })
  })
}

async function buildStock(
  input: Awaited<ReturnType<typeof querySchema.parse>> & { view: 'stock' },
  format: 'xlsx' | 'pdf'
): Promise<[Buffer, string]> {
  const timePeriod = (input.timePeriod || '30d') as TimePeriod
  const filters = {
    categoryId: input.categoryId,
    brand: input.brand,
    vendorId: input.vendorId,
    q: input.q,
    customerId: input.customerId,
    timePeriod,
  }
  const meta = await describeStockFilters(filters)
  const report = await buildStockReportDetailed(filters)
  const buffer =
    format === 'xlsx' ? await stockDetailedToExcel(report, meta) : await stockDetailedToPdf(report, meta)
  return [buffer, 'ยอดคงเหลือ']
}

async function buildOut(
  input: Awaited<ReturnType<typeof querySchema.parse>> & { view: 'out' },
  format: 'xlsx' | 'pdf'
): Promise<[Buffer, string]> {
  const timePeriod = (input.timePeriod || '30d') as TimePeriod
  const filters = {
    categoryId: input.categoryId,
    brand: input.brand,
    vendorId: input.vendorId,
    q: input.q,
    customerId: input.customerId,
    timePeriod,
  }
  const meta = await describeStockFilters(filters)
  const report = await buildOutReportDetailed(filters)
  const buffer =
    format === 'xlsx' ? await outDetailedToExcel(report, meta) : await outDetailedToPdf(report, meta)
  return [buffer, 'สินค้าเบิกออก']
}

async function buildMovement(
  input: Awaited<ReturnType<typeof querySchema.parse>> & { view: 'movement' },
  format: 'xlsx' | 'pdf'
): Promise<[Buffer, string]> {
  // Movement ไม่ใช้ timePeriod — ใช้ from/to จาก filter แทน
  const filters = {
    categoryId: input.categoryId,
    brand: input.brand,
    vendorId: input.vendorId,
    q: input.q,
    customerId: input.customerId,
  }
  const meta = await describeMovementFilters(filters)
  const report = await buildMovementDetail({ ...filters, ...dayRange(input.from!, input.to!) })
  const buffer =
    format === 'xlsx' ? await movementDetailedToExcel(report, meta) : await movementDetailedToPdf(report, meta)
  return [buffer, 'ความเคลื่อนไหว']
}

/** แปลง id ของตัวกรองเป็นชื่อที่คนอ่านรู้เรื่อง สำหรับใส่หัวรายงาน (Stock) */
async function describeStockFilters(filters: {
  categoryId: string | null; brand: string | null; vendorId: string | null; q: string | null
  customerId: string | null; timePeriod: TimePeriod
}): Promise<ExportMeta> {
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
  }
}

/** แปลง id ของตัวกรองเป็นชื่อที่คนอ่านรู้เรื่อง สำหรับใส่หัวรายงาน (Movement) */
async function describeMovementFilters(filters: {
  categoryId: string | null; brand: string | null; vendorId: string | null; q: string | null
  customerId: string | null
}): Promise<ExportMeta> {
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
  }
}
