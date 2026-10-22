import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { HttpError, requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({
  code: z.string().trim().min(1).max(20).toUpperCase().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  photosEnabled: z.boolean().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const user = await requireUser()
    const { id } = await params
    const data = updateSchema.parse(await readJson(request))
    if (data.photosEnabled !== undefined && user.role !== 'ADMIN') {
      throw new HttpError(403, 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งค่าการเก็บรูปได้')
    }
    const category = await prisma.category.update({ where: { id }, data })
    return { category }
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return route(async () => {
    await requireUser()
    const { id } = await params
    const productCount = await prisma.product.count({ where: { categoryId: id } })
    if (productCount > 0) {
      throw new HttpError(409, `ลบไม่ได้ - ยังมีสินค้าอยู่ในประเภทนี้ ${productCount} รายการ`)
    }
    await prisma.category.delete({ where: { id } })
    return { ok: true }
  })
}
