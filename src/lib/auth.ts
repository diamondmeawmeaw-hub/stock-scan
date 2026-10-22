import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { prisma } from './prisma'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  resolveCookieSecure,
  signSession,
  verifySession,
  type SessionPayload,
} from './session'

export { SESSION_COOKIE, type SessionPayload }

const BCRYPT_ROUNDS = 10

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/** ตรวจ username/password แล้วคืน payload ถ้าผ่าน */
export async function authenticate(
  username: string,
  password: string
): Promise<SessionPayload | null> {
  const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } })
  if (!user || !user.active) return null
  if (!(await verifyPassword(password, user.passwordHash))) return null
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  }
}

export async function startSession(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: resolveCookieSecure(process.env),
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export async function endSession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  return verifySession(store.get(SESSION_COOKIE)?.value)
}

/**
 * อ่าน session แล้วยืนยันกับฐานข้อมูลอีกชั้น - คืน null ถ้าไม่มี/ถูกปิดใช้งาน
 *
 * JWT อยู่ได้ 12 ชม. ถ้าเชื่อ token อย่างเดียว คนที่ถูกปิดใช้งานหรือถูกลดสิทธิ์
 * จะทำงานต่อได้จนกว่า token จะหมดอายุ หน้าเว็บทุกหน้าจึงต้องใช้ตัวนี้
 */
export async function getCurrentUser(): Promise<SessionPayload | null> {
  const session = await getSession()
  if (!session) return null
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      active: true,
    },
  })
  if (!user?.active) return null
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  }
}

/**
 * ใช้ในหน้า/route ที่ต้อง login - โยน HttpError 401 ถ้าไม่มี session
 *
 * ตรวจ active จากฐานข้อมูลด้วย เพราะ JWT อายุ 12 ชม. ไม่งั้นคนที่ถูกปิดใช้งาน
 * จะทำงานต่อได้จนกว่าโทเคนจะหมดอายุ
 */
export async function requireUser(): Promise<SessionPayload> {
  const user = await getCurrentUser()
  if (!user) throw new HttpError(401, 'ต้องเข้าสู่ระบบก่อน')
  return user
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireUser()
  if (session.role !== 'ADMIN') throw new HttpError(403, 'ต้องเป็นผู้ดูแลระบบเท่านั้น')
  return session
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'HttpError'
  }
}
