import { mkdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** เก็บไฟล์ export ชั่วคราวนอกโฟลเดอร์โปรเจกต์ - ไม่ปนกับ source และไม่ต้อง commit */
export function exportDirectory(): string {
  return process.env.EXPORT_DIR?.trim() || path.join(os.tmpdir(), 'stock-scan-exports')
}

export function exportFilePath(jobId: string, format: string): string {
  return path.join(exportDirectory(), `${jobId}.${format}`)
}

export async function ensureExportDirectory(): Promise<void> {
  await mkdir(exportDirectory(), { recursive: true })
}

export async function removeExportFile(jobId: string, format: string): Promise<void> {
  await rm(exportFilePath(jobId, format), { force: true })
}

export async function exportFileSize(jobId: string, format: string): Promise<number> {
  const info = await stat(exportFilePath(jobId, format))
  return info.size
}
