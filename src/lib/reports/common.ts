import type { TimePeriod } from '@/lib/date-range'

/** ข้อมูลประกอบหัวรายงานที่ใช้ร่วมกันทั้งไฟล์ Excel และ PDF */
export type ExportMeta = {
  categoryName?: string | null
  brand?: string | null
  vendorName?: string | null
  customerName?: string | null
  timePeriod?: TimePeriod | null
  q?: string | null
  /** เวลาที่ออกรายงาน - ส่งเข้ามาเพื่อให้เทสกำหนดค่าคงที่ได้ */
  generatedAt?: Date
}

const THAI_OFFSET = '+07:00'

/** YYYY-MM-DD -> วันที่แบบไทย */
export function thaiDate(date: string): string {
  return new Date(`${date}T00:00:00${THAI_OFFSET}`).toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
  })
}

export function thaiDateTime(at: Date): string {
  return at.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
}

const TIME_PERIOD_LABELS: Record<string, string> = {
  '7d': '7 วันที่ผ่านมา',
  '30d': '30 วันที่ผ่านมา',
  '6m': '6 เดือนที่ผ่านมา',
  '1y': '1 ปีที่ผ่านมา',
  all: 'ทั้งหมด',
}

/** สรุปตัวกรองที่ใช้เป็นข้อความบรรทัดเดียว เพื่อให้คนอ่านไฟล์รู้ว่ากรองอะไรมา */
export function filterSummary(meta: ExportMeta): string {
  const parts: string[] = []
  if (meta.categoryName) parts.push(`ประเภทของ: ${meta.categoryName}`)
  if (meta.brand) parts.push(`แบรนด์: ${meta.brand}`)
  if (meta.vendorName) parts.push(`ผู้จำหน่าย: ${meta.vendorName}`)
  if (meta.customerName) parts.push(`ผู้ซื้อ: ${meta.customerName}`)
  if (meta.timePeriod && meta.timePeriod !== 'all') {
    parts.push(`ช่วงเวลา: ${TIME_PERIOD_LABELS[meta.timePeriod] ?? meta.timePeriod}`)
  }
  if (meta.q) parts.push(`ค้นหา: ${meta.q}`)
  return parts.length > 0 ? parts.join(' · ') : 'ไม่ได้กรอง (ทั้งหมด)'
}
