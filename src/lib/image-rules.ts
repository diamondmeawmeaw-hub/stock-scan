/**
 * กติกากลางของ "รูปอุปกรณ์" ที่ใช้ทั้งฝั่งเซิร์ฟเวอร์และฝั่งเบราว์เซอร์
 *
 * แยกออกมาเป็นไฟล์เปล่า ๆ (ไม่ import prisma/auth) เพื่อให้ client component
 * ใช้ค่าพวกนี้ได้โดยไม่ลากโค้ดฝั่งเซิร์ฟเวอร์เข้า bundle
 */

/** ขนาดไฟล์ดิบสูงสุดต่อรูป (ก่อนบีบอัดฝั่งเบราว์เซอร์) */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** จำนวนรูปสูงสุดต่อ 1 เครื่อง (serial) */
export const MAX_IMAGES_PER_UNIT = 8

/** คำอธิบายเริ่มต้นของรูป */
export const DEFAULT_IMAGE_LABEL = 'รูปตัวอุปกรณ์'

/** ความยาวสูงสุดของคำอธิบายรูป */
export const MAX_LABEL_LENGTH = 60

/** ชนิดไฟล์ที่ยอมรับ */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number]

/** ใช้กับ <input type="file" accept="..."> */
export const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(',')

/** ขนาดสูงสุดที่อ่านง่ายสำหรับข้อความ error */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
