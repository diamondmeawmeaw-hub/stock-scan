import { z } from 'zod'
import { fileRoute } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { dayRange, todayInThailand } from '@/lib/date-range'
import { buildMovementReport, buildStockReport } from '@/lib/scan-service'
import type { ExportMeta } from '@/lib/reports/common'
import { movementToExcel, stockToExcel } from '@/lib/reports/excel'
import { movementToPdf, stockToPdf } from '@/lib/reports/pdf'

// pdfmake/exceljs ต้องรันบน Node ไม่ใช่ Edge runtime
export const runtime = 'nodejs'

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')

const querySchema = z
  .object({
    view: z.enum(['stock', 'movement'], { message: 'ประเภทรายงานต้องเป็น stock หรือ movement' }),
    format: z.enum(['xlsx', 'pdf'], { message: 'รูปแบบไฟล์ต้องเป็น xlsx หรือ pdf' }),
    categoryId: z.string().nullable(),
    brand: z.string().nullable(),
    vendorId: z.string().nullable(),
    q: z.string().nullable(),
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
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    })

    const filters = {
      categoryId: input.categoryId,
      brand: input.brand,
      vendorId: input.vendorId,
      q: input.q,
    }
    const meta = await describeFilters(filters)

    const [buffer, title] =
      input.view === 'stock'
        ? await buildStock(filters, meta, input.format)
        : await buildMovement(filters, meta, input.format, input.from!, input.to!)

    const filename = `${title}-${todayInThailand()}.${input.format}`
    return new Response(new Uint8Array(buffer), {
      headers: {
        'content-type': CONTENT_TYPE[input.format],
        // ชื่อไฟล์เป็นภาษาไทย จึงต้องเข้ารหัสตาม RFC 5987
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'cache-control': 'no-store',
      },
    })
  })
}

async function buildStock(
  filters: ExportFilters,
  meta: ExportMeta,
  format: 'xlsx' | 'pdf'
): Promise<[Buffer, string]> {
  const report = await buildStockReport(filters)
  const buffer =
    format === 'xlsx' ? await stockToExcel(report, meta) : await stockToPdf(report, meta)
  return [buffer, 'ยอดคงเหลือ']
}

async function buildMovement(
  filters: ExportFilters,
  meta: ExportMeta,
  format: 'xlsx' | 'pdf',
  from: string,
  to: string
): Promise<[Buffer, string]> {
  const report = await buildMovementReport({ ...filters, ...dayRange(from, to) })
  const buffer =
    format === 'xlsx' ? await movementToExcel(report, meta) : await movementToPdf(report, meta)
  return [buffer, 'ความเคลื่อนไหว']
}

type ExportFilters = {
  categoryId: string | null
  brand: string | null
  vendorId: string | null
  q: string | null
}

/** แปลง id ของตัวกรองเป็นชื่อที่คนอ่านรู้เรื่อง สำหรับใส่หัวรายงาน */
async function describeFilters(filters: ExportFilters): Promise<ExportMeta> {
  const [category, vendor] = await Promise.all([
    filters.categoryId
      ? prisma.category.findUnique({ where: { id: filters.categoryId }, select: { name: true } })
      : null,
    filters.vendorId
      ? prisma.vendor.findUnique({ where: { id: filters.vendorId }, select: { name: true } })
      : null,
  ])
  return {
    categoryName: category?.name ?? null,
    brand: filters.brand,
    vendorName: vendor?.name ?? null,
    q: filters.q,
  }
}
