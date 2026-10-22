import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UsersClient } from './UsersClient'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  // ต้องอ่าน role จากฐานข้อมูล ไม่ใช่จาก JWT - แอดมินที่ถูกลดสิทธิ์
  // ต้องเข้าไม่ได้ทันที แม้ token เดิมจะยังบอกว่า ADMIN
  const user = await getCurrentUser()
  if (!user) redirect('/login?reauth=1')
  if (user.role !== 'ADMIN') redirect('/')

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
      currentUserId={user.userId}
      users={users.map(({ _count, ...u }) => ({
        ...u,
        historyCount: _count.scanLogs + _count.auditSessions,
      }))}
    />
  )
}
