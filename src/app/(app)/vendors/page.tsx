import { prisma } from '@/lib/prisma'
import { VendorsClient } from './VendorsClient'

export const dynamic = 'force-dynamic'

export default async function VendorsPage() {
  const vendors = await prisma.vendor.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { units: true } } },
  })

  return (
    <VendorsClient
      vendors={vendors.map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        note: v.note,
        active: v.active,
        unitCount: v._count.units,
      }))}
    />
  )
}
