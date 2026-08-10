import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { scanOut } from '@/lib/scan-service'

const schema = z.object({
  serial: z.string().min(1, 'ไม่ได้ส่ง serial มา'),
  reason: z.enum(['SALE', 'INTERNAL_USE', 'DAMAGED', 'RETURN_SUPPLIER', 'OTHER']),
  note: z.string().trim().max(500).optional().nullable(),
})

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser()
    const body = schema.parse(await readJson(request))
    return scanOut({
      rawSerial: body.serial,
      userId: user.userId,
      reason: body.reason,
      note: body.note ?? null,
    })
  })
}
