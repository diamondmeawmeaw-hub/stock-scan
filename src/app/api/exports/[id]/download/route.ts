import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { fileRoute } from '@/lib/api'
import { HttpError, requireUser } from '@/lib/auth'
import { exportFilePath } from '@/lib/exports/files'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

type Context = { params: Promise<{ id: string }> }

/** ดาวน์โหลดไฟล์ที่สร้างเสร็จแล้ว - ไฟล์อยู่ใน temp ของเครื่องและหมดอายุใน 24 ชม. */
export async function GET(_request: Request, context: Context) {
  return fileRoute(async () => {
    const user = await requireUser()
    const { id } = await context.params
    const job = await prisma.exportJob.findUnique({ where: { id } })

    if (!job || (job.userId !== user.userId && user.role !== 'ADMIN')) {
      throw new HttpError(404, 'ไม่พบไฟล์ export นี้')
    }
    if (job.status !== 'DONE' || !job.fileName) {
      throw new HttpError(409, 'ไฟล์ยังสร้างไม่เสร็จ')
    }
    if (job.expiresAt && job.expiresAt.getTime() <= Date.now()) {
      throw new HttpError(410, 'ไฟล์หมดอายุแล้ว กรุณาสร้างใหม่')
    }

    const filePath = exportFilePath(job.id, job.format)
    let info
    try {
      info = await stat(filePath)
    } catch {
      throw new HttpError(410, 'ไม่พบไฟล์บนเซิร์ฟเวอร์ กรุณาสร้างใหม่')
    }

    const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream
    return new Response(stream, {
      headers: {
        'content-type': job.contentType ?? 'application/octet-stream',
        'content-length': String(info.size),
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(job.fileName)}`,
        'cache-control': 'private, no-store',
      },
    })
  })
}
