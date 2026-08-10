/**
 * แปลงวันที่แบบ YYYY-MM-DD ที่ผู้ใช้เลือก ให้เป็นช่วงเวลาจริงของ "วันนั้นตามเวลาไทย"
 *
 * ตัวคอนเทนเนอร์บน NAS มักตั้งเป็น UTC ถ้าตีความวันตามเวลาเครื่อง ของที่ยิงตอน
 * เช้าตรู่หรือดึกของไทยจะหลุดไปอยู่ผิดวัน ไทยไม่มี DST จึงตรึง +07:00 ได้เลย
 */
const THAI_OFFSET = '+07:00'

export function dayRange(from: string, to: string): { from: Date; to: Date } {
  return {
    from: new Date(`${from}T00:00:00.000${THAI_OFFSET}`),
    to: new Date(`${to}T23:59:59.999${THAI_OFFSET}`),
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
