import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { HttpError, requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({
  sku: z.string().trim().min(1).max(40).toUpperCase().optional(),
  name: z.string().trim().min(1).max(150).optional(),
  brand: z.string().trim().max(80).optional().nullable(),
  categoryId: z.string().min(1).optional(),
  note: z.string().trim().max(500).optional().nullable(),
  trackingType: z.enum(['SERIAL', 'QUANTITY']).optional(),
  unitLabel: z.string().trim().max(20).optional().nullable(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    await requireUser()
    const { id } = await params
    const data = updateSchema.parse(await readJson(request))
    const existing = await prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { units: true, scanLogs: true } } },
    })
    if (!existing) throw new HttpError(404, 'ไม่พบสินค้านี้')
    // สลับวิธีนับสต็อกได้เฉพาะตอนยังไม่มีของและยังไม่มีประวัติ กันยอดเก่าหาย/เพี้ยน
    if (data.trackingType && data.trackingType !== existing.trackingType) {
      const hasHistory =
        existing._count.units > 0 || existing.stockQty !== 0 || existing._count.scanLogs > 0
      if (hasHistory) {
        throw new HttpError(
          409,
          'เปลี่ยนวิธีนับไม่ได้ - สินค้านี้มีของคงเหลือหรือประวัติแล้ว ให้สร้างสินค้าใหม่แทน'
        )
      }
    }
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...data,
        ...(data.trackingType === 'QUANTITY' && !data.unitLabel
          ? { unitLabel: existing.unitLabel ?? 'ชิ้น' }
          : {}),
        ...(data.trackingType === 'SERIAL' ? { unitLabel: null, stockQty: 0 } : {}),
      },
    })
    return { product }
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return route(async () => {
    await requireUser()
    const { id } = await params
    const existing = await prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { units: true, scanLogs: true } } },
    })
    if (!existing) throw new HttpError(404, 'ไม่พบสินค้านี้')
    const unitCount = existing._count.units
    if (unitCount > 0) {
      throw new HttpError(409, `ลบไม่ได้ - สินค้านี้มี serial อยู่ในระบบแล้ว ${unitCount} ชิ้น`)
    }
    if (existing.stockQty !== 0) {
      throw new HttpError(409, `ลบไม่ได้ - สินค้านี้ยังมียอดคงเหลือ ${existing.stockQty} อยู่`)
    }
    if (existing._count.scanLogs > 0) {
      throw new HttpError(409, 'ลบไม่ได้ - สินค้านี้มีประวัติรับเข้า/เบิกออกแล้ว')
    }
    await prisma.product.delete({ where: { id } })
    return { ok: true }
  })
}
