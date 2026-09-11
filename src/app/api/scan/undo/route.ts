import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { HttpError } from '@/lib/auth'

const schema = z.object({
  scanLogId: z.string().min(1, 'ต้องระบุ scanLogId'),
})

export async function POST(request: Request) {
  return route(async () => {
    await requireUser()
    const body = schema.parse(await readJson(request))

    const log = await prisma.scanLog.findUnique({
      where: { id: body.scanLogId },
      include: { unit: true, product: { select: { trackingType: true } } },
    })

    if (!log) throw new HttpError(404, 'ไม่พบบันทึกการสแกนนี้')
    if (log.type !== 'IN') throw new HttpError(400, 'ยกเลิกได้เฉพาะการรับเข้าสต็อก')
    if (!log.accepted) throw new HttpError(400, 'รายการนี้ถูกปฏิเสธไปแล้ว ไม่ต้องยกเลิก')
    if (!log.unitId) {
      throw new HttpError(400, 'รายการนับจำนวนยกเลิกไม่ได้ - ให้เบิกออกเพื่อปรับยอดแทน')
    }

    await prisma.$transaction(async (tx) => {
      if (log.result === 'CREATED' && log.unitId) {
        // สร้าง log ยกเลิกก่อนลบ unit เพื่อไม่ให้ foreign key error
        await tx.scanLog.create({
          data: {
            serial: log.serial,
            type: 'IN',
            result: 'CREATED',
            accepted: false,
            message: `ยกเลิกการรับเข้า: ${log.message}`,
            userId: log.userId,
            productId: log.productId,
            unitId: log.unitId,
            vendorId: log.vendorId,
          },
        })
        await tx.serialUnit.delete({ where: { id: log.unitId } })
      } else if (log.result === 'RETURNED' && log.unitId) {
        await tx.serialUnit.update({
          where: { id: log.unitId },
          data: { status: 'OUT', receivedAt: null, releasedAt: new Date(), lastScanAt: new Date() },
        })

        await tx.scanLog.create({
          data: {
            serial: log.serial,
            type: 'IN',
            result: 'RETURNED',
            accepted: false,
            message: `ยกเลิกการรับคืน: ${log.message}`,
            userId: log.userId,
            productId: log.productId,
            unitId: log.unitId,
            vendorId: log.vendorId,
          },
        })
      }
    })

    return { success: true }
  })
}