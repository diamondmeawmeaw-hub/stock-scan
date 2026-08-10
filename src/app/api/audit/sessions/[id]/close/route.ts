import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { closeAuditSession } from '@/lib/scan-service'

const schema = z.object({
  /** ปรับสต็อกตามผลนับจริงเลยหรือไม่ (ของหาย -> ตัดออก, ของเกิน -> รับเข้า) */
  applyAdjustments: z.boolean().default(false),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const user = await requireUser()
    const { id } = await params
    const body = schema.parse(await readJson(request).catch(() => ({})))
    const report = await closeAuditSession({
      sessionId: id,
      userId: user.userId,
      applyAdjustments: body.applyAdjustments,
    })
    return { report }
  })
}
