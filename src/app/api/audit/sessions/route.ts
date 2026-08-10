import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { openAuditSession } from '@/lib/scan-service'

const createSchema = z.object({
  name: z.string().trim().min(1, 'ตั้งชื่อรอบตรวจนับด้วย').max(100),
  categoryId: z.string().min(1).optional().nullable(),
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
    const session = await openAuditSession({
      name: body.name,
      categoryId: body.categoryId ?? null,
      userId: user.userId,
      note: body.note ?? null,
    })
    return { session: { id: session.id, name: session.name, status: session.status } }
  })
}
