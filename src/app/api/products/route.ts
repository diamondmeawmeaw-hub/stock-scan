import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  sku: z.string().trim().min(1, 'กรอกรหัสสินค้า (SKU)').max(40).toUpperCase(),
  name: z.string().trim().min(1, 'กรอกชื่อสินค้า').max(150),
  brand: z.string().trim().max(80).optional().nullable(),
  categoryId: z.string().min(1, 'เลือกประเภทของ'),
  note: z.string().trim().max(500).optional().nullable(),
})

export async function GET(request: Request) {
  return route(async () => {
    await requireUser()
    const categoryId = new URL(request.url).searchParams.get('categoryId')
    const products = await prisma.product.findMany({
      where: categoryId ? { categoryId } : undefined,
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      include: {
        category: true,
        _count: { select: { units: { where: { status: 'IN_STOCK' } } } },
      },
    })
    return {
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        note: p.note,
        categoryId: p.categoryId,
        categoryName: p.category.name,
        inStock: p._count.units,
      })),
    }
  })
}

export async function POST(request: Request) {
  return route(async () => {
    await requireUser()
    const data = createSchema.parse(await readJson(request))
    const product = await prisma.product.create({ data })
    return { product }
  })
}
