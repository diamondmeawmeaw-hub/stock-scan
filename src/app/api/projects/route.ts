import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { HttpError, requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  customerId: z.string().min(1, 'ต้องเลือกลูกค้าก่อน'),
  name: z.string().trim().min(1, 'กรอกชื่อโปรเจค').max(100),
  note: z.string().trim().max(500).optional().nullable(),
})

/** GET /api/projects?customerId=xxx - ลิสต์โปรเจค (ของลูกค้าคนเดียวถ้าระบุ) */
export async function GET(request: Request) {
  return route(async () => {
    await requireUser()
    const customerId = new URL(request.url).searchParams.get('customerId')?.trim() || null
    return {
      projects: await prisma.project.findMany({
        where: customerId ? { customerId } : undefined,
        orderBy: [{ customerId: 'asc' }, { active: 'desc' }, { name: 'asc' }],
        include: { customer: { select: { code: true, name: true } } },
      }),
    }
  })
}

export async function POST(request: Request) {
  return route(async () => {
    await requireUser()
    const data = createSchema.parse(await readJson(request))
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } })
    if (!customer) throw new HttpError(400, 'ไม่พบลูกค้าที่เลือกไว้')
    return {
      project: await prisma.project.create({
        data: { customerId: data.customerId, name: data.name, note: data.note ?? null },
      }),
    }
  })
}
