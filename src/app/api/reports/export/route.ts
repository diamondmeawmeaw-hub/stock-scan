import { fileRoute } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { buildSmallExport } from '@/lib/exports/build'
import { reportExportSchema } from '@/lib/exports/schema'

// pdfmake/exceljs ต้องรันบน Node ไม่ใช่ Edge runtime
export const runtime = 'nodejs'

export async function GET(request: Request) {
  return fileRoute(async () => {
    await requireUser()
    const params = new URL(request.url).searchParams
    const input = reportExportSchema.parse({
      type: 'reports',
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

    const file = await buildSmallExport(input)
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        'content-type': file.contentType,
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'cache-control': 'no-store',
      },
    })
  })
}
