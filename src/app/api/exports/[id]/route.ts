import { route } from '@/lib/api'
import { HttpError, requireUser } from '@/lib/auth'
import { kickExportWorker } from '@/lib/exports/jobs'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

type Context = { params: Promise<{ id: string }> }

/** สถานะงาน export - หน้าจอ poll จนกว่า status จะเป็น DONE หรือ FAILED */
export async function GET(_request: Request, context: Context) {
  return route(async () => {
    const user = await requireUser()
    const { id } = await context.params
    const job = await prisma.exportJob.findUnique({ where: { id } })

    // ไม่เปิดเผยว่ามีงานของคนอื่นอยู่หรือไม่
    if (!job || (job.userId !== user.userId && user.role !== 'ADMIN')) {
      throw new HttpError(404, 'ไม่พบงาน export นี้')
    }

    if (job.status === 'PENDING' || job.status === 'RUNNING') kickExportWorker()

    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
      fileName: job.fileName,
      size: job.size,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      expiresAt: job.expiresAt,
      downloadUrl: job.status === 'DONE' ? `/api/exports/${job.id}/download` : null,
    }
  })
}
