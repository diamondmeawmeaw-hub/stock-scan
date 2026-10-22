/**
 * แปลงวันที่แบบ YYYY-MM-DD ที่ผู้ใช้เลือก ให้เป็นช่วงเวลาจริงของ "วันนั้นตามเวลาไทย"
 *
 * ตัวคอนเทนเนอร์บน NAS มักตั้งเป็น UTC ถ้าตีความวันตามเวลาเครื่อง ของที่ยิงตอน
 * เช้าตรู่หรือดึกของไทยจะหลุดไปอยู่ผิดวัน ไทยไม่มี DST จึงตรึง +07:00 ได้เลย
 */
const THAI_OFFSET = '+07:00'

/**
 * ตรวจว่าเป็นวันที่ YYYY-MM-DD ที่มีอยู่จริงในปฏิทิน
 * (regex อย่างเดียวไม่พอ - 2026-02-31 / 2026-13-01 ผ่าน regex ได้แต่สร้าง Date เพี้ยน)
 */
export function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const at = new Date(Date.UTC(year, month - 1, day))
  return (
    at.getUTCFullYear() === year &&
    at.getUTCMonth() === month - 1 &&
    at.getUTCDate() === day
  )
}

export function dayRange(from: string, to: string): { from: Date; to: Date } {
  return {
    from: new Date(`${from}T00:00:00.000${THAI_OFFSET}`),
    to: new Date(`${to}T23:59:59.999${THAI_OFFSET}`),
  }
}

/**
 * ช่วงวันแบบเปิดปลายได้ - ใช้กับตัวกรองที่เลือกวันข้างเดียว
 * - from อย่างเดียว = ตั้งแต่วันนั้นเป็นต้นไป (ไม่มีเพดานบน)
 * - to อย่างเดียว = ถึงวันนั้น (ย้อนหลังไม่จำกัด)
 * - ใส่มาเกินจริงหรือ from > to จะถูกสลับให้
 */
export function optionalDayRange(from: string, to: string): { from?: Date; to?: Date } {
  const f = isValidDateInput(from) ? from : ''
  const t = isValidDateInput(to) ? to : ''
  const [start, end] = f && t ? (f <= t ? [f, t] : [t, f]) : [f, t]
  return {
    from: start ? dayRange(start, start).from : undefined,
    to: end ? dayRange(end, end).to : undefined,
  }
}

/** วันที่วันนี้ตามเวลาไทย ในรูปแบบ YYYY-MM-DD */
export function todayInThailand(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** ย้อนหลังไป n วันจากวันที่ที่ให้มา (YYYY-MM-DD -> YYYY-MM-DD) */
export function shiftDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000${THAI_OFFSET}`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return todayInThailand(shifted)
}

export type TimePeriod = '7d' | '30d' | '6m' | '1y' | 'all'

/**
 * แปลง TimePeriod option เป็นช่วงวันที่ (from/to) ตามเวลาไทย
 *
 * ใช้ todayInThailand() เพื่อให้ได้วันที่ปัจจุบันตามเวลาไทยจริง
 * จากนั้นคำนวณย้อนหลังด้วย shiftDays() แล้วแปลงเป็น Date ด้วย dayRange()
 * เพื่อให้ timezone offset +07:00 ถูกต้อง (ไม่ขึ้นกับ timezone ของเครื่อง server)
 */
export function timePeriodRange(period: TimePeriod): { from: Date; to: Date } | null {
  if (period === 'all') return null
  const today = todayInThailand()
  let from: string
  switch (period) {
    case '7d':
      from = shiftDays(today, -7)
      break
    case '30d':
      from = shiftDays(today, -30)
      break
    case '6m':
      from = shiftDays(today, -183)
      break
    case '1y':
      from = shiftDays(today, -365)
      break
    default:
      return null
  }
  return dayRange(from, today)
}

export const TIME_PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: '7d', label: '7 วันที่ผ่านมา' },
  { value: '30d', label: '30 วันที่ผ่านมา' },
  { value: '6m', label: '6 เดือนที่ผ่านมา' },
  { value: '1y', label: '1 ปีที่ผ่านมา' },
  { value: 'all', label: 'ทั้งหมด' },
]
