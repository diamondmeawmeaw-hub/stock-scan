import { prisma } from '@/lib/prisma'
import { CategoriesClient } from './CategoriesClient'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  })

  return (
    <CategoriesClient
      categories={categories.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        productCount: c._count.products,
      }))}
    />
  )
}
