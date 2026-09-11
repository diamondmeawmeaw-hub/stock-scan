import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { quantityOut } from '@/lib/scan-service'

const schema = z.object({
  productId: z.string().min(1, 'ต้องเลือกสินค้าก่อน'),
  quantity: z.number({ invalid_type_error: 'จำนวนต้องเป็นตัวเลข' }),
  reason: z.enum(['SALE', 'INTERNAL_USE', 'DAMAGED', 'RETURN_SUPPLIER', 'OTHER']),
  note: z.string().trim().max(500).optional().nullable(),
  customerId: z.string().min(1).optional().nullable(),
})

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser()
    const body = schema.parse(await readJson(request))
    return quantityOut({
      productId: body.productId,
      rawQuantity: body.quantity,
      userId: user.userId,
      reason: body.reason,
      note: body.note ?? null,
      customerId: body.customerId ?? null,
    })
  })
}
