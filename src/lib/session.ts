import { SignJWT, jwtVerify } from 'jose'

/**
 * ส่วนของ session ที่ปลอดภัยจะ import จาก middleware (edge runtime) -
 * ห้ามพา prisma หรือ bcrypt เข้ามาในไฟล์นี้
 */

export const SESSION_COOKIE = 'stock_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12 // 12 ชม. = ครอบคลุมกะทำงานหนึ่งกะ

export type SessionPayload = {
  userId: string
  username: string
  displayName: string
  role: 'ADMIN' | 'STAFF'
}

/**
 * cookie secure=true ทำให้เบราว์เซอร์ส่ง cookie กลับมาเฉพาะบน https
 * บน NAS ที่เข้าผ่าน http:// ตรงๆ ถ้าเปิดไว้จะ login ไม่ติดทั้งที่รหัสถูก
 * จึงแยกเป็น env ของตัวเอง ไม่ผูกกับ NODE_ENV
 */
export function resolveCookieSecure(env: {
  COOKIE_SECURE?: string
  NODE_ENV?: string
}): boolean {
  const value = env.COOKIE_SECURE?.trim().toLowerCase()
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return env.NODE_ENV === 'production'
}

const PLACEHOLDER_SECRETS = new Set([
  // ค่าใน .env.example / Dockerfile - ใช้ได้เฉพาะ dev/ตอน build
  'dev-secret-change-me-please-32-chars-min',
  'build-time-placeholder-secret-value-32',
])
let warnedPlaceholderSecret = false

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('ต้องตั้งค่า AUTH_SECRET (อย่างน้อย 16 ตัวอักษร) ใน environment')
  }
  if (
    process.env.NODE_ENV === 'production' &&
    PLACEHOLDER_SECRETS.has(secret) &&
    !warnedPlaceholderSecret
  ) {
    warnedPlaceholderSecret = true
    // ไม่ throw เพื่อไม่ให้ build/demo ล้มทั้งระบบ แต่ต้องเห็นใน log ชัด ๆ
    console.error(
      '[security] AUTH_SECRET ยังเป็นค่าตัวอย่าง ห้ามใช้บนเครื่องจริง - สุ่มใหม่ด้วย: openssl rand -base64 32'
    )
  }
  return new TextEncoder().encode(secret)
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey())
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey())
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.username !== 'string' ||
      typeof payload.displayName !== 'string' ||
      (payload.role !== 'ADMIN' && payload.role !== 'STAFF')
    ) {
      return null
    }
    return {
      userId: payload.userId,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
    }
  } catch {
    return null
  }
}
