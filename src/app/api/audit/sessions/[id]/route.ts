import { route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { buildAuditReport } from '@/lib/scan-service'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  return route(async () => {
    await requireUser()
    const { id } = await params
    return { report: await buildAuditReport(id) }
  })
}
