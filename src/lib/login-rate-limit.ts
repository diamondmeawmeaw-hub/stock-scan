/**
 * จำกัดการลองรหัสผ่านแบบ in-memory
 *
 * แอปนี้รันเป็น process เดียวบน NAS จึงใช้ Map ในหน่วยความจำได้
 * ถ้าย้ายไปรันหลาย instance ต้องเปลี่ยนไปใช้ Redis/ฐานข้อมูลร่วมกัน
 */
const WINDOW_MS = 15 * 60 * 1000
const MAX_USER_FAILURES = 5
const MAX_IP_FAILURES = 30

type Attempt = {
  failures: number
  resetAt: number
}

const attempts = new Map<string, Attempt>()

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

function userKey(ip: string, username: string): string {
  return `user:${ip}:${normalizeUsername(username)}`
}

function ipKey(ip: string): string {
  return `ip:${ip}`
}

function prune(now: number): void {
  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= now) attempts.delete(key)
  }
}

function bump(key: string, now: number): void {
  const current = attempts.get(key)
  if (!current || current.resetAt <= now) {
    attempts.set(key, { failures: 1, resetAt: now + WINDOW_MS })
    return
  }
  current.failures += 1
}

export type LoginRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

/** เรียกก่อนตรวจรหัสผ่าน - ถ้าถูกล็อกอยู่ให้ตอบ 429 โดยไม่ต้อง query ฐานข้อมูล */
export function checkLoginRateLimit(
  ip: string,
  username: string,
  now = Date.now()
): LoginRateLimitResult {
  prune(now)

  const checks = [
    { key: userKey(ip, username), max: MAX_USER_FAILURES },
    { key: ipKey(ip), max: MAX_IP_FAILURES },
  ]

  for (const { key, max } of checks) {
    const attempt = attempts.get(key)
    if (attempt && attempt.failures >= max) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((attempt.resetAt - now) / 1000)),
      }
    }
  }

  return { allowed: true }
}

/** บันทึกเฉพาะเมื่อชื่อผู้ใช้/รหัสผ่านผิด - ไม่นับ request ที่ข้อมูลไม่ครบ */
export function recordLoginFailure(ip: string, username: string, now = Date.now()): void {
  prune(now)
  bump(userKey(ip, username), now)
  bump(ipKey(ip), now)
}

/** login สำเร็จแล้วล้างเฉพาะคู่ IP+ผู้ใช้ ไม่ล้างยอดรวมของ IP เพื่อกันการสลับบัญชีมา reset */
export function clearLoginFailures(ip: string, username: string): void {
  attempts.delete(userKey(ip, username))
}
