import { describe, expect, it } from 'vitest'
import { dayRange, shiftDays, todayInThailand } from '@/lib/date-range'

describe('dayRange', () => {
  it('คลุมทั้งวันตามเวลาไทย ไม่ขึ้นกับ timezone ของเครื่อง', () => {
    const { from, to } = dayRange('2026-08-04', '2026-08-04')
    // 4 ส.ค. 00:00 ไทย = 3 ส.ค. 17:00 UTC
    expect(from.toISOString()).toBe('2026-08-03T17:00:00.000Z')
    expect(to.toISOString()).toBe('2026-08-04T16:59:59.999Z')
  })

  it('ของที่ยิงตอนตี 1 ของไทย ยังอยู่ในวันเดียวกัน', () => {
    const { from, to } = dayRange('2026-08-04', '2026-08-04')
    const scannedAt = new Date('2026-08-04T01:00:00+07:00')
    expect(scannedAt >= from && scannedAt <= to).toBe(true)
  })

  it('ช่วงหลายวันครอบคลุมตั้งแต่ต้นวันแรกถึงท้ายวันสุดท้าย', () => {
    const { from, to } = dayRange('2026-08-01', '2026-08-03')
    expect(from.toISOString()).toBe('2026-07-31T17:00:00.000Z')
    expect(to.toISOString()).toBe('2026-08-03T16:59:59.999Z')
  })
})

describe('shiftDays', () => {
  it('ย้อนหลังได้', () => {
    expect(shiftDays('2026-08-04', -6)).toBe('2026-07-29')
  })

  it('ข้ามเดือนและปีได้', () => {
    expect(shiftDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDays('2026-02-28', 1)).toBe('2026-03-01')
  })
})

describe('todayInThailand', () => {
  it('คืนรูปแบบ YYYY-MM-DD', () => {
    expect(todayInThailand(new Date('2026-08-04T12:00:00Z'))).toBe('2026-08-04')
  })

  it('เวลา 22:00 UTC = วันถัดไปแล้วในไทย', () => {
    expect(todayInThailand(new Date('2026-08-04T22:00:00Z'))).toBe('2026-08-05')
  })
})
