import { route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { createExportJob, kickExportWorker } from '@/lib/exports/jobs'
import { exportRequestSchema } from '@/lib/exports/schema'

export const runtime = 'nodejs'

/** สร้างงาน export เบื้องหลัง - คืน id ให้หน้าจอคอยถามสถานะ */
export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser()
    const body = await request.json().catch(() => null)
    const input = exportRequestSchema.parse(body)
    const job = await createExportJob(user.userId, input)
    kickExportWorker()
    return { id: job.id, status: job.status }
  })
}
