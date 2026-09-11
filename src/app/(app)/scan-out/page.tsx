import { ScanOutClient } from './ScanOutClient'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function ScanOutPage() {
  const [customers, quantityProducts] = await Promise.all([
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
  ])
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">เบิกออกจากคลัง</h1>
        <p className="text-sm text-slate-500">
          ของรายชิ้น: เลือกเหตุผลไว้ก่อน แล้วยิง serial ได้เลย · ของนับจำนวน: เลือกสินค้าแล้วกรอกจำนวน
        </p>
      </div>
      <ScanOutClient
        customers={customers}
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
