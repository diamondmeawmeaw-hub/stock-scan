import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { HttpError, requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { openAuditSession } from '@/lib/scan-service'

const createSchema = z.object({
  name: z.string().trim().min(1, 'ตั้งชื่อรอบตรวจนับด้วย').max(100),
  categoryId: z.string().min(1).optional().nullable(),
  // โหมดกำหนดเองส่ง keys นี้มาเสมอ (ว่างทั้งคู่ = 400) - ไม่ส่งมาเลย = ใช้ categoryId/ทั้งคลังแบบเดิม
  categoryIds: z.array(z.string().min(1)).optional(),
  productIds: z.array(z.string().min(1)).optional(),
  note: z.string().trim().max(500).optional().nullable(),
})

export async function GET() {
  return route(async () => {
    await requireUser()
    const sessions = await prisma.auditSession.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: {
        category: true,
        startedBy: { select: { displayName: true } },
        _count: { select: { scans: { where: { accepted: true } } } },
      },
    })
    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        categoryName: s.category?.name ?? null,
        startedAt: s.startedAt.toISOString(),
        closedAt: s.closedAt?.toISOString() ?? null,
        startedBy: s.startedBy.displayName,
        scannedCount: s._count.scans,
      })),
    }
  })
}

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser()
    const body = createSchema.parse(await readJson(request))
    const customMode = body.categoryIds !== undefined || body.productIds !== undefined
    const categoryIds = body.categoryIds ?? []
    const productIds = body.productIds ?? []
    if (customMode && categoryIds.length === 0 && productIds.length === 0) {
      throw new HttpError(400, 'โหมดกำหนดเองต้องติ๊กอย่างน้อย 1 ประเภทหรือ 1 รุ่น')
    }
    const session = await openAuditSession({
      name: body.name,
      categoryId: body.categoryId ?? null,
      categoryIds,
      productIds,
      userId: user.userId,
      note: body.note ?? null,
    })
    return { session: { id: session.id, name: session.name, status: session.status } }
  })
}
