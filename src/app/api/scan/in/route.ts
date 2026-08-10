import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { scanIn } from '@/lib/scan-service'

const schema = z.object({
  serial: z.string().min(1, 'ไม่ได้ส่ง serial มา'),
  productId: z.string().min(1, 'ต้องเลือกสินค้าก่อนเริ่มยิง'),
  vendorId: z.string().min(1).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
})

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser()
    const body = schema.parse(await readJson(request))
    return scanIn({
      rawSerial: body.serial,
      productId: body.productId,
      userId: user.userId,
      vendorId: body.vendorId ?? null,
      note: body.note ?? null,
    })
  })
}
