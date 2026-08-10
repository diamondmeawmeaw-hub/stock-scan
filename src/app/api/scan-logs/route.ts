import { z } from 'zod'
import { route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { dayRange } from '@/lib/date-range'
import { listScanLogs } from '@/lib/scan-service'

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')

const querySchema = z.object({
  q: z.string().optional(),
  type: z.enum(['IN', 'OUT', 'AUDIT']).optional(),
  userId: z.string().optional(),
  from: DATE.optional(),
  to: DATE.optional(),
  page: z.coerce.number().int().min(1).optional(),
})

export async function GET(request: Request) {
  return route(async () => {
    await requireUser()
    const params = new URL(request.url).searchParams
    const raw = Object.fromEntries(
      ['q', 'type', 'userId', 'from', 'to', 'page']
        .map((key) => [key, params.get(key)?.trim()])
        .filter(([, value]) => value)
    )
    const input = querySchema.parse(raw)

    // เลือกมาข้างเดียวก็ยังกรองได้ - ใส่ค่าเดียวกันอีกฝั่งเพื่อให้ dayRange คำนวณขอบวันแบบไทย
    const range =
      input.from || input.to
        ? dayRange(input.from ?? input.to!, input.to ?? input.from!)
        : null

    return listScanLogs({
      q: input.q,
      type: input.type,
      userId: input.userId,
      from: range?.from,
      to: range?.to,
      page: input.page,
    })
  })
}
