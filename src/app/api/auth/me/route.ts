import { route } from '@/lib/api'
import { getSession } from '@/lib/auth'

export async function GET() {
  return route(async () => ({ user: await getSession() }))
}
