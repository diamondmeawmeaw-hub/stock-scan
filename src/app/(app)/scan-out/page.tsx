import { ScanOutClient } from './ScanOutClient'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function ScanOutPage() {
  const [customers, quantityProducts, projects] = await Promise.all([
    prisma.customer.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    }),
    prisma.product.findMany({
      where: { trackingType: 'QUANTITY' },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      include: { category: true },
    }),
    prisma.project.findMany({
      where: { active: true, customer: { active: true } },
      orderBy: [{ customerId: 'asc' }, { name: 'asc' }],
      select: { id: true, customerId: true, name: true },
    }),
  ])
  return (
    <div className="space-y-4">
      <div className="scan-hero">
        <h1 className="text-2xl font-bold text-sky-950 dark:text-sky-100">เบิกออกจากคลัง</h1>
        <p className="mt-1 text-sm text-sky-900/70 dark:text-sky-200/70">
          ของรายชิ้น: เลือกเหตุผลไว้ก่อน แล้วยิง serial ได้เลย · ของนับจำนวน: เลือกสินค้าแล้วกรอกจำนวน
        </p>
      </div>
      <ScanOutClient
        customers={customers}
        projects={projects}
        quantityProducts={quantityProducts.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          categoryName: p.category.name,
          unitLabel: p.unitLabel,
          inStock: p.stockQty,
        }))}
      />
    </div>
  )
}
