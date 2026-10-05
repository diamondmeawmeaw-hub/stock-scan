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
      <div className="scan-hero">
        <h1 className="text-2xl font-bold text-sky-950">รับเข้าสต็อก</h1>
        <p className="mt-1 text-sm text-sky-900/70">
          สินค้าแบบรายชิ้น: เลือกสินค้าแล้ว ยิง serial ต่อกันได้เรื่อยๆ · สินค้าแบบจำนวน: เลือกสินค้าแล้วกรอกจำนวน
        </p>
      </div>
      <ScanInClient
        vendors={vendors}
        products={products.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          categoryName: p.category.name,
          trackingType: p.trackingType,
          unitLabel: p.unitLabel,
          inStock: p.trackingType === 'QUANTITY' ? p.stockQty : p._count.units,
        }))}
      />
    </div>
  )
}
