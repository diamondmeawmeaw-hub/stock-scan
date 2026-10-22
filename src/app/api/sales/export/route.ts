import { fileRoute } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { buildSmallExport } from '@/lib/exports/build'
import { salesExportSchema } from '@/lib/exports/schema'

// pdfmake/exceljs ต้องรันบน Node ไม่ใช่ Edge runtime
export const runtime = 'nodejs'

export async function GET(request: Request) {
  return fileRoute(async () => {
    await requireUser()
    const params = new URL(request.url).searchParams
    const input = salesExportSchema.parse({
      type: 'sales',
      format: params.get('format') ?? '',
      customerId: params.get('customerId'),
      projectId: params.get('projectId'),
      q: params.get('q'),
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
