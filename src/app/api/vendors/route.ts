import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  code: z.string().trim().min(1, 'กรอกรหัสผู้ขาย').max(20).toUpperCase(),
  name: z.string().trim().min(1, 'กรอกชื่อผู้ขาย').max(100),
  note: z.string().trim().max(500).optional().nullable(),
})

export async function GET() {
  return route(async () => {
    await requireUser()
    const vendors = await prisma.vendor.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { units: true } } },
    })
    return { vendors }
  })
}

export async function POST(request: Request) {
  return route(async () => {
    await requireUser()
    const data = createSchema.parse(await readJson(request))
    const vendor = await prisma.vendor.create({ data: { ...data, note: data.note ?? null } })
    return { vendor }
  })
}
