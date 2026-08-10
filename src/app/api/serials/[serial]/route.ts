import { route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { lookupSerial } from '@/lib/scan-service'

export async function GET(_request: Request, { params }: { params: Promise<{ serial: string }> }) {
  return route(async () => {
    await requireUser()
    const { serial } = await params
    return lookupSerial(decodeURIComponent(serial))
  })
}
