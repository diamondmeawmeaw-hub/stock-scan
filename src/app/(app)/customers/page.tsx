import { prisma } from '@/lib/prisma'
import { CustomersClient } from './CustomersClient'

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const [customers, projects] = await Promise.all([
    prisma.customer.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { scanLogs: { where: { type: 'OUT', reason: 'SALE', accepted: true } } } } },
    }),
    prisma.project.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { scanLogs: { where: { type: 'OUT', reason: 'SALE', accepted: true } } } } },
    }),
  ])
  return (
    <CustomersClient
      customers={customers.map((c) => ({ ...c, saleCount: c._count.scanLogs }))}
      projects={projects.map((p) => ({
        id: p.id,
        customerId: p.customerId,
        name: p.name,
        note: p.note,
        active: p.active,
        saleCount: p._count.scanLogs,
      }))}
    />
  )
}
