import { z } from 'zod'
import { readJson, route } from '@/lib/api'
import { HttpError, authenticate, startSession } from '@/lib/auth'

const schema = z.object({
  username: z.string().min(1, 'กรอกชื่อผู้ใช้'),
  password: z.string().min(1, 'กรอกรหัสผ่าน'),
})

export async function POST(request: Request) {
  return route(async () => {
    const { username, password } = schema.parse(await readJson(request))
    const session = await authenticate(username, password)
    if (!session) throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    await startSession(session)
    return { user: session }
  })
}
