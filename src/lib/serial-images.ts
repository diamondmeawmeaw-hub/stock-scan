import { prisma } from './prisma'
import { HttpError } from './auth'
import { normalizeSerial } from './scan-rules'
import {
  ALLOWED_IMAGE_TYPES,
  DEFAULT_IMAGE_LABEL,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_UNIT,
  MAX_LABEL_LENGTH,
  formatBytes,
  type AllowedImageType,
} from './image-rules'

/**
 * รูปอุปกรณ์ (NVR และของรายชิ้นอื่น ๆ) - ใช้ยืนยันตัวเครื่องตอนเครม
 *
 * เก็บไบต์ลงฐานข้อมูลโดยตรง (คอลัมน์ BYTEA) เพื่อให้ติดไปกับ pg_dump
 * และไม่หายเมื่อ rebuild container (เครื่องนี้ไม่มี object storage)
 */

export type SerialImageMeta = {
  id: string
  label: string
  fileName: string
  mimeType: string
  size: number
  createdAt: string
  uploadedByName: string
}

const META_SELECT = {
  id: true,
  label: true,
  fileName: true,
  mimeType: true,
  size: true,
  createdAt: true,
  uploadedBy: { select: { displayName: true } },
} as const

type MetaRow = {
  id: string
  label: string
  fileName: string
  mimeType: string
  size: number
  createdAt: Date
  uploadedBy: { displayName: string }
}

function toMeta(row: MetaRow): SerialImageMeta {
  return {
    id: row.id,
    label: row.label,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
    uploadedByName: row.uploadedBy.displayName,
  }
}

/** หาเครื่องจาก serial - โยน 404 ถ้าไม่มีในคลัง (ของนับจำนวนไม่มี serial จึงใช้ฟีเจอร์นี้ไม่ได้) */
async function unitForSerial(rawSerial: string): Promise<{ id: string; serial: string }> {
  const serial = normalizeSerial(rawSerial ?? '')
  if (!serial) throw new HttpError(400, 'ต้องระบุ serial')
  const unit = await prisma.serialUnit.findUnique({
    where: { serial },
    select: { id: true, serial: true },
  })
  if (!unit) throw new HttpError(404, `ไม่พบ serial ${serial} ในคลัง`)
  return unit
}

export async function listSerialImages(rawSerial: string): Promise<{
  serial: string
  maxImages: number
  images: SerialImageMeta[]
}> {
  const unit = await unitForSerial(rawSerial)
  const rows = await prisma.serialImage.findMany({
    where: { unitId: unit.id },
    orderBy: { createdAt: 'desc' },
    select: META_SELECT,
  })
  return { serial: unit.serial, maxImages: MAX_IMAGES_PER_UNIT, images: rows.map(toMeta) }
}

/** ตรวจลายเซ็นไฟล์จริง ไม่เชื่อ Content-Type ที่เบราว์เซอร์ส่งมา */
function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF' &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

const EXTENSION_BY_TYPE: Record<AllowedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function sanitizeFileName(name: string, type: AllowedImageType): string {
  // เอาเฉพาะชื่อไฟล์ ไม่เอา path ที่อาจหลุดมา และตัดอักขระที่ใช้ตั้งชื่อไฟล์บน Windows ไม่ได้
  const base = (name ?? '').split(/[\\/]/).pop() ?? ''
  const cleaned = base.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim()
  const fallback = `photo.${EXTENSION_BY_TYPE[type]}`
  return (cleaned || fallback).slice(0, 120)
}

function sanitizeLabel(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.trim() : ''
  return (text || DEFAULT_IMAGE_LABEL).slice(0, MAX_LABEL_LENGTH)
}

export async function saveSerialImage(input: {
  rawSerial: string
  file: File
  label?: unknown
  userId: string
}): Promise<{ image: SerialImageMeta; maxImages: number }> {
  const unit = await unitForSerial(input.rawSerial)
  const { file } = input

  if (file.size === 0) throw new HttpError(400, 'ไฟล์รูปว่างเปล่า')
  if (file.size > MAX_IMAGE_BYTES) {
    throw new HttpError(400, `รูปใหญ่เกิน ${formatBytes(MAX_IMAGE_BYTES)} (ไฟล์นี้ ${formatBytes(file.size)})`)
  }
  if (file.type && !ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageType)) {
    throw new HttpError(400, 'รับเฉพาะรูป JPG, PNG หรือ WebP')
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffImageType(bytes)
  if (!type) throw new HttpError(400, 'ไฟล์นี้ไม่ใช่รูปภาพ JPG, PNG หรือ WebP')

  const label = sanitizeLabel(input.label)
  const fileName = sanitizeFileName(file.name, type)

  const image = await prisma.$transaction(async (tx) => {
    const count = await tx.serialImage.count({ where: { unitId: unit.id } })
    if (count >= MAX_IMAGES_PER_UNIT) {
      throw new HttpError(
        400,
        `แนบรูปได้สูงสุด ${MAX_IMAGES_PER_UNIT} รูปต่อเครื่อง - ลบรูปเก่าออกก่อน`
      )
    }
    return tx.serialImage.create({
      data: {
        unitId: unit.id,
        label,
        fileName,
        mimeType: type,
        size: bytes.byteLength,
        data: bytes,
        uploadedById: input.userId,
      },
      select: META_SELECT,
    })
  })

  return { image: toMeta(image), maxImages: MAX_IMAGES_PER_UNIT }
}

export async function getSerialImage(input: {
  rawSerial: string
  imageId: string
}): Promise<{
  fileName: string
  mimeType: string
  size: number
  data: Uint8Array
}> {
  const unit = await unitForSerial(input.rawSerial)
  const image = await prisma.serialImage.findFirst({
    where: { id: input.imageId, unitId: unit.id },
    select: { fileName: true, mimeType: true, size: true, data: true },
  })
  if (!image) throw new HttpError(404, 'ไม่พบรูปนี้')
  return image
}

export async function deleteSerialImage(input: {
  rawSerial: string
  imageId: string
}): Promise<{ ok: true }> {
  const unit = await unitForSerial(input.rawSerial)
  const result = await prisma.serialImage.deleteMany({
    where: { id: input.imageId, unitId: unit.id },
  })
  if (result.count === 0) throw new HttpError(404, 'ไม่พบรูปนี้')
  return { ok: true }
}
