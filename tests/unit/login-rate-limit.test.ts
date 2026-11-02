import { describe, expect, it } from 'vitest'
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from '@/lib/login-rate-limit'

const WINDOW_MS = 15 * 60 * 1000

describe('login rate limit', () => {
  it('ล็อกหลังผิด 5 ครั้ง และปลดล็อกเมื่อพ้นหน้าต่างเวลา', () => {
    const now = 1_000_000
    for (let i = 0; i < 5; i++) recordLoginFailure('10.0.0.1', 'user-a', now)

    expect(checkLoginRateLimit('10.0.0.1', 'user-a', now)).toMatchObject({ allowed: false })
    expect(checkLoginRateLimit('10.0.0.2', 'user-a', now)).toEqual({ allowed: true })
    expect(checkLoginRateLimit('10.0.0.1', 'user-b', now)).toEqual({ allowed: true })

    expect(checkLoginRateLimit('10.0.0.1', 'user-a', now + WINDOW_MS + 1)).toEqual({
      allowed: true,
    })
  })

  it('login สำเร็จล้างเฉพาะคู่ IP+ผู้ใช้', () => {
    const now = 2_000_000
    for (let i = 0; i < 4; i++) recordLoginFailure('10.0.0.3', 'user-c', now)

    clearLoginFailures('10.0.0.3', 'user-c')
    recordLoginFailure('10.0.0.3', 'user-c', now)

    expect(checkLoginRateLimit('10.0.0.3', 'user-c', now)).toEqual({ allowed: true })
  })

  it('ผิดหลายชื่อผู้ใช้จาก IP เดียวกันจนถึงเพดาน -> บล็อกทั้ง IP', () => {
    const now = 3_000_000
    for (let i = 0; i < 30; i++) recordLoginFailure('10.0.0.4', `user-${i}`, now)

    expect(checkLoginRateLimit('10.0.0.4', 'user-new', now)).toMatchObject({ allowed: false })
    expect(checkLoginRateLimit('10.0.0.5', 'user-new', now)).toEqual({ allowed: true })
  })
})
