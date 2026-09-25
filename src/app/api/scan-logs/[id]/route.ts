import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { HttpError, requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  /** ย้ายรายการข้ามโปรเจค - ส่ง null เพื่อถอดออกจากโปรเจค */
  projectId: z.string().min(1).nullable().optional(),
})

/**
 * PATCH /api/scan-logs/[id] - ย้ายรายการขายเข้า/ออกโปรเจค
 *
 * แก้ได้เฉพาะรายการขายที่สำเร็จและยังไม่ถูกคืน
 * เพราะของถูกคืนเข้าคลังแล้วไม่ควรนับอยู่ในงานไหน
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await requireUser()
    const { id } = await params
    const body = schema.parse(await readJson(request))
    if (body.projectId === undefined) throw new HttpError(400, 'ไม่ได้ส่งโปรเจคมา')

    const log = await prisma.scanLog.findUnique({
      where: { id },
      include: { reversedBy: { select: { id: true } } },
    })
    if (!log) throw new HttpError(404, 'ไม่พบรายการนี้')
    if (log.type !== 'OUT' || !log.accepted || log.result !== 'OK' || log.reason !== 'SALE') {
      throw new HttpError(400, 'ย้ายได้เฉพาะรายการขายที่สำเร็จเท่านั้น')
    }
    if (log.reversedBy) throw new HttpError(409, 'รายการนี้ถูกคืนเข้าคลังแล้ว ย้ายไม่ได้')
    if (!log.customerId) throw new HttpError(400, 'รายการนี้ไม่ได้ผูกกับลูกค้า')

    if (body.projectId) {
      const project = await prisma.project.findUnique({ where: { id: body.projectId } })
      if (!project) throw new HttpError(400, 'ไม่พบโปรเจคที่เลือกไว้')
      if (project.customerId !== log.customerId) {
        throw new HttpError(400, 'โปรเจคนี้ไม่ได้เป็นของลูกค้าคนเดียวกับที่ซื้อของรายการนี้')
      }
    }

    const updated = await prisma.scanLog.update({
      where: { id },
      data: { projectId: body.projectId ?? null },
      select: { id: true, projectId: true },
    })
    return { scanLog: updated }
  })
}
