import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { suggestProduct } from '@/lib/ai-suggest'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  keyword: z.string().trim().min(1, 'กรอกรหัสหรือชื่อรุ่นก่อนกดปุ่ม AI').max(40),
})

/** ขอ AI ช่วยเติมข้อมูลสินค้า - แค่เสนอ fill ฟอร์ม ไม่บันทึกอะไรทั้งนั้น */
export async function POST(request: Request) {
  return route(async () => {
    await requireUser()
    const { keyword } = schema.parse(await readJson(request))

    const [categories, brands] = await Promise.all([
      prisma.category.findMany({ orderBy: { name: 'asc' } }),
      prisma.product.findMany({
        where: { brand: { not: null } },
        distinct: ['brand'],
        select: { brand: true },
      }),
    ])
    const suggestion = await suggestProduct(
      keyword,
      {
        categories: categories.map((c) => ({ id: c.id, code: c.code, name: c.name })),
        brands: brands.map((b) => b.brand as string).filter(Boolean),
      }
    )
    return { suggestion }
  })
}
