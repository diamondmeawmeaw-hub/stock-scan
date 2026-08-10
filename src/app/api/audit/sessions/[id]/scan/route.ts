import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { auditScan } from '@/lib/scan-service'

const schema = z.object({ serial: z.string().min(1, 'ไม่ได้ส่ง serial มา') })

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const user = await requireUser()
    const { id } = await params
    const body = schema.parse(await readJson(request))
    return auditScan({ sessionId: id, rawSerial: body.serial, userId: user.userId })
  })
}
