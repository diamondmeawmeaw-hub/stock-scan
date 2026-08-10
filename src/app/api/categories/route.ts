import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  code: z.string().trim().min(1, 'กรอกรหัสประเภทของ').max(20).toUpperCase(),
  name: z.string().trim().min(1, 'กรอกชื่อประเภทของ').max(100),
})

export async function GET() {
  return route(async () => {
    await requireUser()
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    })
    return { categories }
  })
}

export async function POST(request: Request) {
  return route(async () => {
    await requireUser()
    const data = createSchema.parse(await readJson(request))
    const category = await prisma.category.create({ data })
    return { category }
  })
}
