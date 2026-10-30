import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { HttpError, requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { lockSerial } from '@/lib/scan-service'

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
    if (!log.serial) {
      throw new HttpError(400, 'รายการนี้ไม่มี serial ผูกอยู่ ยกเลิกไม่ได้')
    }
    const serial = log.serial
    const unitId = log.unitId
    // รองรับแค่ 2 แบบที่ย้อนกลับได้อย่างปลอดภัย - ชนิดอื่นตอบ error ชัดเจน
    // (เดิมตกทะลุไปตอบ success ทั้งที่ไม่ได้ทำอะไร)
    if (log.result !== 'CREATED' && log.result !== 'RETURNED') {
      throw new HttpError(400, 'รายการนี้ยกเลิกไม่ได้ - ยกเลิกได้เฉพาะรับเข้าใหม่หรือรับคืนเท่านั้น')
    }

    await prisma.$transaction(async (tx) => {
      // ต้องล็อก serial ตัวเดียวกับ scan-in/scan-out ก่อนอ่านสถานะ
      // ไม่งั้นการเบิกออกที่เกิดพร้อมกันอาจ commit หลังเราเช็กสถานะแต่ก่อนลบ unit
      // ทำให้เหลือ log ขายที่ชี้ unit ที่ถูกลบไปแล้ว
      await lockSerial(tx, serial)

      // อ่านสถานะล่าสุดหลังได้ lock - กันเคสของเปลี่ยนมือไปแล้ว
      // (เช่น รับเข้า -> เบิกออกไปขาย -> มากดลบแถวรับเข้า จะลบของที่ขายไปแล้วทิ้ง)
      const unit = await tx.serialUnit.findUnique({ where: { id: unitId } })
      if (!unit) throw new HttpError(404, 'ไม่พบของชิ้นนี้ในระบบแล้ว')
      if (unit.status !== 'IN_STOCK') {
        throw new HttpError(
          409,
          'ของชิ้นนี้เปลี่ยนสถานะไปแล้ว (อาจถูกเบิกออก) รีเฟรชดูก่อนแล้วทำรายการใหม่'
        )
      }

      // มีประวัติหลังจากรายการนี้ = เคยถูกเบิก/คืน/ตรวจนับไปแล้ว
      // ห้ามลบ unit ทิ้งเพราะจะทำให้ประวัติเหล่านั้นผูกของที่หายไป
      const later = await tx.scanLog.findFirst({
        where: {
          unitId,
          id: { not: log.id },
          accepted: true,
          createdAt: { gte: log.createdAt },
        },
        select: { id: true },
      })
      if (later) {
        throw new HttpError(
          409,
          'รายการนี้มีประวัติการเคลื่อนไหวหลังจากนั้นแล้ว ยกเลิกไม่ได้'
        )
      }

      if (log.result === 'CREATED') {
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
            unitId,
            vendorId: log.vendorId,
          },
        })
        await tx.serialUnit.delete({ where: { id: unitId } })
      } else if (log.result === 'RETURNED') {
        await tx.serialUnit.update({
          where: { id: unitId },
          data: { status: 'OUT', receivedAt: null, releasedAt: new Date(), lastScanAt: new Date() },
        })

        // ปลดสายโยงคืนของ - ไม่งั้นรายการเบิกเดิมถูกตราว่าคืนไปแล้วถาวร ทั้งที่เพิ่งยกเลิกการคืน
        await tx.scanLog.update({
          where: { id: log.id },
          data: { reversesId: null },
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
            unitId,
            vendorId: log.vendorId,
          },
        })
      }
    })

    return { success: true }
  })
}
