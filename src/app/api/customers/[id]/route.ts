import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  code: z.string().trim().min(1).max(20).toUpperCase().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await requireUser()
    const { id } = await params
    return { customer: await prisma.customer.update({ where: { id }, data: schema.parse(await readJson(request)) }) }
  })
}
