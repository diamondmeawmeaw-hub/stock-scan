import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  code: z.string().trim().min(1, 'กรอกรหัสลูกค้า').max(20).toUpperCase(),
  name: z.string().trim().min(1, 'กรอกชื่อลูกค้า').max(100),
  note: z.string().trim().max(500).optional().nullable(),
})

export async function GET() {
  return route(async () => {
    await requireUser()
    return { customers: await prisma.customer.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }) }
  })
}

export async function POST(request: Request) {
  return route(async () => {
    await requireUser()
    const data = schema.parse(await readJson(request))
    return { customer: await prisma.customer.create({ data: { ...data, note: data.note ?? null } }) }
  })
}
