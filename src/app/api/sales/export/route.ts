import { z } from 'zod'
import { fileRoute } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { dayRange, todayInThailand } from '@/lib/date-range'
import { buildSalesReport } from '@/lib/scan-service'
import type { ExportMeta } from '@/lib/reports/common'
import { salesToExcel } from '@/lib/reports/excel'
import { salesToPdf } from '@/lib/reports/pdf'

// pdfmake/exceljs ต้องรันบน Node ไม่ใช่ Edge runtime
export const runtime = 'nodejs'

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')

const querySchema = z.object({
  format: z.enum(['xlsx', 'pdf'], { message: 'รูปแบบไฟล์ต้องเป็น xlsx หรือ pdf' }),
  customerId: z.string().nullable(),
  projectId: z.string().nullable(),
  q: z.string().nullable(),
  from: DATE.optional(),
  to: DATE.optional(),
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
      format: params.get('format') ?? '',
      customerId: params.get('customerId'),
      projectId: params.get('projectId'),
      q: params.get('q'),
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    })

    const range =
      input.from || input.to ? dayRange(input.from || input.to!, input.to || input.from!) : null
    const report = await buildSalesReport({
      customerId: input.customerId,
      projectId: input.projectId,
      q: input.q,
      from: range?.from ?? null,
      to: range?.to ?? null,
    })

    const [customer, project] = await Promise.all([
      input.customerId
        ? prisma.customer.findUnique({ where: { id: input.customerId }, select: { name: true } })
        : null,
      input.projectId
        ? prisma.project.findUnique({ where: { id: input.projectId }, select: { name: true } })
        : null,
    ])
    const meta: ExportMeta = {
      customerName: customer?.name ?? null,
      projectName: project?.name ?? null,
      q: input.q,
    }
    const buffer =
      input.format === 'xlsx' ? await salesToExcel(report, meta) : await salesToPdf(report, meta)

    const filename = `ประวัติการขาย-${todayInThailand()}.${input.format}`
    return new Response(new Uint8Array(buffer), {
      headers: {
        'content-type': CONTENT_TYPE[input.format],
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'cache-control': 'no-store',
      },
    })
  })
}
