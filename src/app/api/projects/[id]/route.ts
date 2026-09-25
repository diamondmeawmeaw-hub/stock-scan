import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  name: z.string().trim().min(1, 'กรอกชื่อโปรเจค').max(100).optional(),
  note: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().optional(),
})

/** PATCH /api/projects/[id] - เปลี่ยนชื่อ/หมายเหตุ หรือปิด-เปิดโปรเจค */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await requireUser()
    const { id } = await params
    return { project: await prisma.project.update({ where: { id }, data: schema.parse(await readJson(request)) }) }
  })
}
