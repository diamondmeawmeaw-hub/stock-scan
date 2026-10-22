import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { CategoriesClient } from './CategoriesClient'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  const [categories, session] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    }),
    getSession(),
  ])

  return (
    <CategoriesClient
      canEditPhotos={session?.role === 'ADMIN'}
      categories={categories.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        productCount: c._count.products,
        photosEnabled: c.photosEnabled,
      }))}
    />
  )
}
