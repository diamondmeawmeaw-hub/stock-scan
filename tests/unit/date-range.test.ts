import { describe, expect, it } from 'vitest'
import { dayRange, isValidDateInput, optionalDayRange, shiftDays, timePeriodRange, todayInThailand } from '@/lib/date-range'

describe('isValidDateInput', () => {
  it('รับวันที่จริงในรูปแบบ YYYY-MM-DD', () => {
    expect(isValidDateInput('2026-08-04')).toBe(true)
    expect(isValidDateInput('2024-02-29')).toBe(true)
  })

  it('ปฏิเสธวันที่ที่ไม่มีอยู่จริง แม้รูปแบบจะถูก', () => {
    expect(isValidDateInput('2026-02-31')).toBe(false)
    expect(isValidDateInput('2026-13-01')).toBe(false)
    expect(isValidDateInput('2026-00-10')).toBe(false)
    expect(isValidDateInput('2025-02-29')).toBe(false)
  })

  it('ปฏิเสธรูปแบบอื่นและค่าว่าง', () => {
    expect(isValidDateInput('')).toBe(false)
    expect(isValidDateInput('4/8/2026')).toBe(false)
    expect(isValidDateInput('2026-8-4')).toBe(false)
  })
})

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

describe('optionalDayRange', () => {
  it('เลือก from ข้างเดียว -> เริ่มต้นวันนั้น ไม่มีเพดานบน', () => {
    const range = optionalDayRange('2026-08-04', '')
    expect(range.from?.toISOString()).toBe('2026-08-03T17:00:00.000Z')
    expect(range.to).toBeUndefined()
  })

  it('เลือก to ข้างเดียว -> ถึงท้ายวันนั้น ไม่มีจุดเริ่มต้น', () => {
    const range = optionalDayRange('', '2026-08-04')
    expect(range.from).toBeUndefined()
    expect(range.to?.toISOString()).toBe('2026-08-04T16:59:59.999Z')
  })

  it('เลือกทั้งคู่ -> ต้นวันแรกถึงท้ายวันสุดท้าย และสลับให้ถ้ากลับด้าน', () => {
    const range = optionalDayRange('2026-08-04', '2026-08-01')
    expect(range.from?.toISOString()).toBe('2026-07-31T17:00:00.000Z')
    expect(range.to?.toISOString()).toBe('2026-08-04T16:59:59.999Z')
  })

  it('วันที่เสีย -> ไม่กรอง', () => {
    expect(optionalDayRange('2026-02-31', '')).toEqual({ from: undefined, to: undefined })
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

describe('timePeriodRange', () => {
  it('all คืน null', () => {
    expect(timePeriodRange('all')).toBeNull()
  })

  it('to ต้องเป็น 23:59:59.999 ตามเวลาไทย (16:59:59.999Z)', () => {
    const range = timePeriodRange('30d')!
    const toUtc = range.to.toISOString()
    // 23:59:59.999+07:00 = 16:59:59.999Z
    expect(toUtc).toMatch(/T16:59:59\.999Z$/)
  })

  it('from ต้องเป็น 00:00:00.000 ตามเวลาไทย (17:00:00.000Z)', () => {
    const range = timePeriodRange('30d')!
    const fromUtc = range.from.toISOString()
    // 00:00:00.000+07:00 = 17:00:00.000Z
    expect(fromUtc).toMatch(/T17:00:00\.000Z$/)
  })

  it('7d มีช่วงประมาณ 7 วัน', () => {
    const range = timePeriodRange('7d')!
    const diffMs = range.to.getTime() - range.from.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThanOrEqual(7)
    expect(diffDays).toBeLessThan(8)
  })

  it('30d มีช่วงประมาณ 30 วัน', () => {
    const range = timePeriodRange('30d')!
    const diffMs = range.to.getTime() - range.from.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThanOrEqual(30)
    expect(diffDays).toBeLessThan(31)
  })

  it('6m มีช่วงประมาณ 6 เดือน', () => {
    const range = timePeriodRange('6m')!
    const diffMs = range.to.getTime() - range.from.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThanOrEqual(180)
    expect(diffDays).toBeLessThan(190)
  })

  it('1y มีช่วงประมาณ 1 ปี', () => {
    const range = timePeriodRange('1y')!
    const diffMs = range.to.getTime() - range.from.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThanOrEqual(364)
    expect(diffDays).toBeLessThan(367)
  })

  it('from ต้องมาก่อน to เสมอ', () => {
    for (const period of ['7d', '30d', '6m', '1y'] as const) {
      const range = timePeriodRange(period)!
      expect(range.from.getTime()).toBeLessThan(range.to.getTime())
    }
  })
})
