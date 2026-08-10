import { z } from 'zod'
import { route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { buildMovementReport } from '@/lib/scan-service'
import { dayRange } from '@/lib/date-range'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD'),
})

export async function GET(request: Request) {
  return route(async () => {
    await requireUser()
    const params = new URL(request.url).searchParams
    const { from, to } = querySchema.parse({
      from: params.get('from') ?? '',
      to: params.get('to') ?? '',
    })
    const range = dayRange(from, to)
    return buildMovementReport({
      ...range,
      categoryId: params.get('categoryId'),
      brand: params.get('brand'),
      vendorId: params.get('vendorId'),
      q: params.get('q'),
    })
  })
}
