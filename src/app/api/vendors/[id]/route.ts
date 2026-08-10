import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { HttpError, requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({
  code: z.string().trim().min(1).max(20).toUpperCase().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    await requireUser()
    const { id } = await params
    const data = updateSchema.parse(await readJson(request))
    const vendor = await prisma.vendor.update({ where: { id }, data })
    return { vendor }
  })
}

/**
 * ลบได้เฉพาะผู้ขายที่ไม่เคยมีของผูกอยู่
 * ที่เคยรับของเข้ามาแล้วให้ปิดใช้งานแทน (PATCH active: false) เพื่อไม่ให้ประวัติขาด
 */
export async function DELETE(_request: Request, { params }: Params) {
  return route(async () => {
    await requireUser()
    const { id } = await params
    const unitCount = await prisma.serialUnit.count({ where: { vendorId: id } })
    if (unitCount > 0) {
      throw new HttpError(
        409,
        `ลบไม่ได้ - มีของที่รับจากผู้ขายรายนี้อยู่ ${unitCount} ชิ้น (ปิดใช้งานแทนได้)`
      )
    }
    await prisma.vendor.delete({ where: { id } })
    return { ok: true }
  })
}
