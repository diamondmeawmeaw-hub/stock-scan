import { prisma } from '@/lib/prisma'
import { ProductsClient } from './ProductsClient'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      include: {
        category: true,
        _count: { select: { units: { where: { status: 'IN_STOCK' } } } },
      },
    }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
  ])

  return (
    <ProductsClient
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      products={products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        note: p.note,
        categoryId: p.categoryId,
        categoryName: p.category.name,
        inStock: p._count.units,
      }))}
    />
  )
}
