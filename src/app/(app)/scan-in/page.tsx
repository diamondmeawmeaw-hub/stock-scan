import { prisma } from '@/lib/prisma'
import { ScanInClient } from './ScanInClient'

export const dynamic = 'force-dynamic'

export default async function ScanInPage() {
  const [products, vendors] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      include: {
        category: true,
        _count: { select: { units: { where: { status: 'IN_STOCK' } } } },
      },
    }),
    prisma.vendor.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    }),
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">รับเข้าสต็อก</h1>
        <p className="text-sm text-slate-500">
          เลือกสินค้าก่อน แล้วยิง serial ต่อกันได้เรื่อยๆ ทุกตัวจะผูกกับสินค้าที่เลือกไว้
        </p>
      </div>
      <ScanInClient
        vendors={vendors}
        products={products.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          categoryName: p.category.name,
          inStock: p._count.units,
        }))}
      />
    </div>
  )
}
