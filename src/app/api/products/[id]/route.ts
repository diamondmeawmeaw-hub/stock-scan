import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { HttpError, requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({
  sku: z.string().trim().min(1).max(40).toUpperCase().optional(),
  name: z.string().trim().min(1).max(150).optional(),
  brand: z.string().trim().max(80).optional().nullable(),
  categoryId: z.string().min(1).optional(),
  note: z.string().trim().max(500).optional().nullable(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    await requireUser()
    const { id } = await params
    const data = updateSchema.parse(await readJson(request))
    const product = await prisma.product.update({ where: { id }, data })
    return { product }
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return route(async () => {
    await requireUser()
    const { id } = await params
    const unitCount = await prisma.serialUnit.count({ where: { productId: id } })
    if (unitCount > 0) {
      throw new HttpError(409, `ลบไม่ได้ - สินค้านี้มี serial อยู่ในระบบแล้ว ${unitCount} ชิ้น`)
    }
    await prisma.product.delete({ where: { id } })
    return { ok: true }
  })
}
