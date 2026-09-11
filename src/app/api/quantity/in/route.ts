import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { quantityIn } from '@/lib/scan-service'

const schema = z.object({
  productId: z.string().min(1, 'ต้องเลือกสินค้าก่อน'),
  quantity: z.number({ invalid_type_error: 'จำนวนต้องเป็นตัวเลข' }),
  vendorId: z.string().min(1).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
})

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser()
    const body = schema.parse(await readJson(request))
    return quantityIn({
      productId: body.productId,
      rawQuantity: body.quantity,
      userId: user.userId,
      vendorId: body.vendorId ?? null,
      note: body.note ?? null,
    })
  })
}
