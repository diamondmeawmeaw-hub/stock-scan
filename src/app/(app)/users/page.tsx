import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UsersClient } from './UsersClient'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  // middleware เช็คแค่ว่ามี session (รันบน edge จึงแตะ prisma ไม่ได้) - role เช็คที่นี่
  const session = await getSession()
  if (session?.role !== 'ADMIN') redirect('/')

  const users = await prisma.user.findMany({
    orderBy: { username: 'asc' },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      active: true,
      _count: { select: { scanLogs: true, auditSessions: true } },
    },
  })

  return (
    <UsersClient
      currentUserId={session.userId}
      users={users.map(({ _count, ...u }) => ({
        ...u,
        historyCount: _count.scanLogs + _count.auditSessions,
      }))}
    />
  )
}
