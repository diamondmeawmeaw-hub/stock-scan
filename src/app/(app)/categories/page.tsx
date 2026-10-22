import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { CategoriesClient } from './CategoriesClient'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  const [categories, user] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    }),
    getCurrentUser(),
  ])
  if (!user) redirect('/login?reauth=1')

  return (
    <CategoriesClient
      canEditPhotos={user.role === 'ADMIN'}
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
