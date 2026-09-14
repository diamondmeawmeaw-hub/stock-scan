import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { returnOut } from '@/lib/scan-service'

const schema = z.object({
  scanLogId: z.string().min(1, 'ต้องระบุรายการเบิกที่จะคืน'),
  note: z.string().trim().max(500).optional().nullable(),
})

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser()
    const body = schema.parse(await readJson(request))
    return returnOut({
      scanLogId: body.scanLogId,
      userId: user.userId,
      note: body.note ?? null,
    })
  })
}
