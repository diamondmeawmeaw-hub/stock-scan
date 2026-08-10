import { describe, expect, it } from 'vitest'
import { resolveCookieSecure } from '@/lib/session'

describe('resolveCookieSecure', () => {
  it('NAS ที่เข้าผ่าน http:// -> ตั้ง COOKIE_SECURE=false ทับ production ได้', () => {
    expect(resolveCookieSecure({ COOKIE_SECURE: 'false', NODE_ENV: 'production' })).toBe(false)
  })

  it('มี reverse proxy https -> ตั้ง true ได้แม้ไม่ใช่ production', () => {
    expect(resolveCookieSecure({ COOKIE_SECURE: 'true', NODE_ENV: 'development' })).toBe(true)
  })

  it('รับ 1/0 และช่องว่าง/ตัวพิมพ์ใหญ่ได้', () => {
    expect(resolveCookieSecure({ COOKIE_SECURE: '1' })).toBe(true)
    expect(resolveCookieSecure({ COOKIE_SECURE: '0' })).toBe(false)
    expect(resolveCookieSecure({ COOKIE_SECURE: ' TRUE ' })).toBe(true)
  })

  it('ไม่ตั้งค่า -> ใช้ NODE_ENV ตามเดิม', () => {
    expect(resolveCookieSecure({ NODE_ENV: 'production' })).toBe(true)
    expect(resolveCookieSecure({ NODE_ENV: 'development' })).toBe(false)
    expect(resolveCookieSecure({})).toBe(false)
  })

  it('ค่าที่อ่านไม่ออก -> ไม่เปิด secure มั่ว ใช้ NODE_ENV แทน', () => {
    expect(resolveCookieSecure({ COOKIE_SECURE: 'yes', NODE_ENV: 'development' })).toBe(false)
    expect(resolveCookieSecure({ COOKIE_SECURE: '', NODE_ENV: 'production' })).toBe(true)
  })
})
