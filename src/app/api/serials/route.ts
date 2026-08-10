import { route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { searchSerials } from '@/lib/scan-service'

export async function GET(request: Request) {
  return route(async () => {
    await requireUser()
    const q = new URL(request.url).searchParams.get('q') ?? ''
    return { rows: await searchSerials(q) }
  })
}
