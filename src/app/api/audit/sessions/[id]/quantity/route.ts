import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { auditQuantityCount } from '@/lib/scan-service'

const schema = z.object({
  productId: z.string().min(1, 'ต้องเลือกสินค้าก่อน'),
  counted: z.number({ invalid_type_error: 'ยอดนับต้องเป็นตัวเลข' }),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const user = await requireUser()
    const { id } = await params
    const body = schema.parse(await readJson(request))
    return auditQuantityCount({
      sessionId: id,
      productId: body.productId,
      rawCounted: body.counted,
      userId: user.userId,
    })
  })
}
