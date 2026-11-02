import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { HttpError, authenticate, startSession } from '@/lib/auth'
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from '@/lib/login-rate-limit'

const schema = z.object({
  username: z.string().min(1, 'กรอกชื่อผู้ใช้'),
  password: z.string().min(1, 'กรอกรหัสผ่าน'),
})

/** ใช้ IP จาก reverse proxy ถ้ามี - production ต้องมี proxy ที่เขียน header นี้ทับเสมอ */
function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function POST(request: Request) {
  return route(async () => {
    const { username, password } = schema.parse(await readJson(request))
    const ip = clientIp(request)

    const limit = checkLoginRateLimit(ip, username)
    if (!limit.allowed) {
      const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60))
      throw new HttpError(
        429,
        `พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ในอีก ${minutes} นาที`,
        limit.retryAfterSeconds
      )
    }

    const session = await authenticate(username, password)
    if (!session) {
      recordLoginFailure(ip, username)
      throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    }

    clearLoginFailures(ip, username)
    await startSession(session)
    return { user: session }
  })
}
