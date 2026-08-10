import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { hashPassword, requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร')
    .max(40)
    .regex(/^[a-z0-9._-]+$/, 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - เท่านั้น'),
  password: z.string().min(6, 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร').max(100),
  displayName: z.string().trim().min(1, 'กรอกชื่อที่แสดง').max(100),
  role: z.enum(['ADMIN', 'STAFF']).default('STAFF'),
})

/** ฟิลด์ที่ปลอดภัยจะส่งออกไปให้ client - ห้ามมี passwordHash เด็ดขาด */
const publicSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  active: true,
  createdAt: true,
} as const

export async function GET() {
  return route(async () => {
    await requireAdmin()
    const users = await prisma.user.findMany({
      orderBy: { username: 'asc' },
      select: {
        ...publicSelect,
        _count: { select: { scanLogs: true, auditSessions: true } },
      },
    })
    return {
      users: users.map(({ _count, ...user }) => ({
        ...user,
        historyCount: _count.scanLogs + _count.auditSessions,
      })),
    }
  })
}

export async function POST(request: Request) {
  return route(async () => {
    await requireAdmin()
    const { password, ...rest } = createSchema.parse(await readJson(request))
    const user = await prisma.user.create({
      data: { ...rest, passwordHash: await hashPassword(password) },
      select: publicSelect,
    })
    return { user }
  })
}
