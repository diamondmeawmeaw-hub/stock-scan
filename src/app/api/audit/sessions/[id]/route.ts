import { route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { buildAuditReport, deleteAuditSession } from '@/lib/scan-service'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  return route(async () => {
    await requireUser()
    const { id } = await params
    return { report: await buildAuditReport(id) }
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return route(async () => {
    await requireUser()
    const { id } = await params
    return deleteAuditSession({ sessionId: id })
  })
}
