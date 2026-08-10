import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildAuditReport } from '@/lib/scan-service'
import { AuditSessionClient } from './AuditSessionClient'

export const dynamic = 'force-dynamic'

export default async function AuditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await prisma.auditSession.findUnique({ where: { id } })
  if (!session) notFound()

  const report = await buildAuditReport(id)
  return <AuditSessionClient sessionId={id} initialReport={report} />
}
