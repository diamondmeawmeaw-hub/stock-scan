import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { HttpError, hashPassword, requireAdmin, verifyPassword } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({
  displayName: z.string().trim().min(1, 'กรอกชื่อที่แสดง').max(100).optional(),
  role: z.enum(['ADMIN', 'STAFF']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6, 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร').max(100).optional(),
  /** รหัสเดิม - บังคับเฉพาะตอนเปลี่ยนรหัสของบัญชีตัวเอง */
  currentPassword: z.string().max(100).optional(),
})

const publicSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  active: true,
  createdAt: true,
} as const

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const session = await requireAdmin()
    const { id } = await params
    const { password, currentPassword, ...data } = updateSchema.parse(await readJson(request))
    const isSelf = id === session.userId

    // กันบัญชีตัวเอง = การันตีว่ายังเหลือผู้ดูแลที่ใช้งานได้อย่างน้อย 1 คน (คนที่เรียกเอง)
    if (isSelf && (data.role !== undefined || data.active !== undefined)) {
      throw new HttpError(400, 'เปลี่ยนสิทธิ์หรือสถานะของบัญชีตัวเองไม่ได้')
    }

    /**
     * เปลี่ยนรหัสของตัวเองต้องยืนยันรหัสเดิมก่อน กันคนที่เดินมาเจอจอที่เปิดค้างไว้
     * แล้วยึดบัญชีไปเลย
     *
     * ตั้งรหัสให้ "คนอื่น" ไม่ต้องกรอก เพราะผู้ดูแลไม่มีทางรู้รหัสเดิมของเขาอยู่แล้ว
     * (นี่คือกรณีลืมรหัสซึ่งเป็นเหตุผลหลักที่มีปุ่มนี้)
     */
    if (password && isSelf) {
      if (!currentPassword) throw new HttpError(400, 'ต้องกรอกรหัสผ่านเดิมก่อนตั้งรหัสใหม่')
      const me = await prisma.user.findUnique({
        where: { id },
        select: { passwordHash: true },
      })
      if (!me || !(await verifyPassword(currentPassword, me.passwordHash))) {
        throw new HttpError(400, 'รหัสผ่านเดิมไม่ถูกต้อง')
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: { ...data, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
      select: publicSelect,
    })
    return { user }
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return route(async () => {
    const session = await requireAdmin()
    const { id } = await params
    if (id === session.userId) throw new HttpError(400, 'ลบบัญชีตัวเองไม่ได้')

    // ScanLog/AuditSession ผูกแบบ Restrict - ลบผู้ใช้ที่มีประวัติจะทำให้ประวัติหาย
    const [scanCount, auditCount] = await Promise.all([
      prisma.scanLog.count({ where: { userId: id } }),
      prisma.auditSession.count({ where: { startedById: id } }),
    ])
    const historyCount = scanCount + auditCount
    if (historyCount > 0) {
      throw new HttpError(
        409,
        `ลบไม่ได้ - ผู้ใช้นี้มีประวัติในระบบ ${historyCount} รายการ ใช้ "ปิดใช้งาน" แทน`
      )
    }

    await prisma.user.delete({ where: { id } })
    return { ok: true }
  })
}
