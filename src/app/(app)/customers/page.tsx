import { prisma } from '@/lib/prisma'
import { CustomersClient } from './CustomersClient'

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { scanLogs: { where: { type: 'OUT', reason: 'SALE', accepted: true } } } } },
  })
  return <CustomersClient customers={customers.map((c) => ({ ...c, saleCount: c._count.scanLogs }))} />
}
