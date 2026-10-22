'use client'

/**
 * ย่อรูปจากมือถือก่อนอัปโหลด
 *
 * รูปจากกล้องโทรศัพท์มักมีขนาด 4–12 MB ซึ่งอัปโหลดช้าบนหน้างานและทำให้ฐานข้อมูลโตไว
 * ย่อด้านยาวสุดเหลือ 1920px แล้วเข้ารหัสเป็น JPEG (คุณภาพ 85%) ซึ่งยังพออ่านป้าย/
 * สติกเกอร์ serial ตอนเครมได้ชัด
 *
 * ถ้าเบราว์เซอร์ทำไม่ได้ (ไฟล์แปลก/canvas ใช้ไม่ได้) จะส่งไฟล์เดิมไปแทน - ไม่ทำให้อัปโหลดพัง
 */

const MAX_DIMENSION = 1920
const JPEG_QUALITY = 0.85
/** ไฟล์เล็กกว่านี้และไม่ต้องย่ออยู่แล้ว - ส่งเดิมไปเลยไม่ต้อง decode ซ้ำ */
const SKIP_UNDER_BYTES = 1.5 * 1024 * 1024

export async function prepareImage(file: File): Promise<{ blob: Blob; name: string }> {
  const baseName =
    file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/]/g, '_')
      .slice(0, 100) || 'photo'
  const original = { blob: file, name: file.name }

  try {
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return original

    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const longestSide = Math.max(bitmap.width, bitmap.height)
    const scale = longestSide > MAX_DIMENSION ? MAX_DIMENSION / longestSide : 1

    if (scale === 1 && file.size <= SKIP_UNDER_BYTES) {
      bitmap.close()
      return original
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return original
    }

    // พื้นขาวรองรับ PNG โปร่งใส (ไม่งั้นกลายเป็นพื้นดำตอนแปลงเป็น JPEG)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    )
    if (!blob) return original
    return { blob, name: `${baseName}.jpg` }
  } catch {
    return original
  }
}
