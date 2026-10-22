import { writeFile } from 'node:fs/promises'
import type { ExportJob, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exportRowLimit, isExportLimitError } from '@/lib/scan-service'
import { streamMovementToXlsx, streamOutDetailedToXlsx, streamSalesToXlsx, streamStockDetailedToXlsx } from '@/lib/reports/excel-stream'
import {
  buildSmallExport,
  describeMovementFilters,
  describeSalesFilters,
  describeStockFilters,
  exportFileName,
  exportTitle,
  movementRangeFromInput,
  salesFiltersFromInput,
  stockFiltersFromInput,
} from './build'
import { ensureExportDirectory, exportFilePath, exportFileSize, removeExportFile } from './files'
import {
  EXPORT_CONTENT_TYPES,
  exportRequestSchema,
  type ExportRequest,
} from './schema'

const RETENTION_MS = 24 * 60 * 60 * 1000
const STALE_RUNNING_MS = 10 * 60 * 1000
const MAX_EXPORT_FILE_BYTES = 200 * 1024 * 1024

type WorkerState = { running: boolean; again: boolean }
const globalForWorker = globalThis as unknown as { __stockScanExportWorker?: WorkerState }

function workerState(): WorkerState {
  globalForWorker.__stockScanExportWorker ??= { running: false, again: false }
  return globalForWorker.__stockScanExportWorker
}

export async function createExportJob(
  userId: string,
  input: ExportRequest
): Promise<ExportJob> {
  // JSON field ไม่รับ undefined - drop ค่าที่ไม่ได้ส่งมาก่อนเก็บ
  const params = JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue

  // เก็บกวาดงานเก่าที่หมดอายุก่อนสร้างงานใหม่ (ไม่ให้ไฟล์ค้างสะสม)
  await cleanupExpiredExports()

  return prisma.exportJob.create({
    data: {
      userId,
      type: input.type,
      format: input.format,
      params,
    },
  })
}

/** ประมวลผลงานหนึ่งรายการ - เรียกจาก worker หรือเทสโดยตรง */
export async function processExportJob(jobId: string): Promise<void> {
  const claimed = await prisma.exportJob.updateMany({
    where: { id: jobId, status: 'PENDING' },
    data: { status: 'RUNNING', startedAt: new Date(), progress: 5, error: null },
  })
  if (claimed.count === 0) return

  const job = await prisma.exportJob.findUnique({ where: { id: jobId } })
  if (!job) return

  await executeJob(job)
}

async function executeJob(job: ExportJob): Promise<void> {
  const generatedAt = new Date()
  const input = exportRequestSchema.parse(job.params)
  const filePath = exportFilePath(job.id, input.format)

  try {
    await ensureExportDirectory()

    let fileName: string | null = null
    let contentType: string = EXPORT_CONTENT_TYPES[input.format]

    try {
      const small = await buildSmallExport(input, generatedAt)
      await writeFile(filePath, small.buffer)
      fileName = small.fileName
      contentType = small.contentType
    } catch (err) {
      if (!isExportLimitError(err)) throw err
      if (input.format === 'pdf') {
        throw new Error(
          `ไฟล์ PDF รองรับข้อมูลไม่เกิน ${exportRowLimit().toLocaleString('th-TH')} แถว ` +
            'กรุณาเลือก Excel สำหรับข้อมูลขนาดใหญ่'
        )
      }

      await streamLargeExport(input, filePath, generatedAt)
      fileName = exportFileName(exportTitle(input), input.format, generatedAt)
    }

    const size = await exportFileSize(job.id, input.format)
    if (size > MAX_EXPORT_FILE_BYTES) {
      await removeExportFile(job.id, input.format)
      throw new Error('ไฟล์ที่สร้างมีขนาดเกิน 200 MB กรุณากรองข้อมูลให้แคบลง')
    }

    await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: 'DONE',
        progress: 100,
        fileName,
        contentType,
        size,
        finishedAt: new Date(),
        expiresAt: new Date(Date.now() + RETENTION_MS),
      },
    })
  } catch (err) {
    await removeExportFile(job.id, input.format).catch(() => {})
    const message =
      err instanceof Error && err.message ? err.message.slice(0, 500) : 'สร้างไฟล์ไม่สำเร็จ'
    await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        progress: 0,
        error: message,
        finishedAt: new Date(),
        expiresAt: new Date(Date.now() + RETENTION_MS),
      },
    }).catch(() => {})
    console.error(`[export] job ${job.id} failed:`, err)
  }
}

async function streamLargeExport(
  input: ExportRequest,
  filePath: string,
  generatedAt: Date
): Promise<void> {
  if (input.type === 'sales') {
    const filters = salesFiltersFromInput(input)
    const meta = await describeSalesFilters(input, generatedAt)
    await streamSalesToXlsx(filters, meta, filePath)
    return
  }

  if (input.view === 'movement') {
    const { filters, from, to } = movementRangeFromInput(input)
    const meta = await describeMovementFilters(filters, generatedAt)
    await streamMovementToXlsx({ ...filters, from, to }, meta, filePath)
    return
  }

  const filters = stockFiltersFromInput(input)
  const meta = await describeStockFilters(filters, generatedAt)
  if (input.view === 'stock') {
    await streamStockDetailedToXlsx(filters, meta, filePath)
    return
  }
  await streamOutDetailedToXlsx(filters, meta, filePath)
}

async function claimNextJob(): Promise<ExportJob | null> {
  while (true) {
    const next = await prisma.exportJob.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (!next) return null

    const claimed = await prisma.exportJob.updateMany({
      where: { id: next.id, status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: new Date(), progress: 5, error: null },
    })
    if (claimed.count === 0) continue

    return prisma.exportJob.findUnique({ where: { id: next.id } })
  }
}

/** ปลุก worker ให้ไล่ทำงานที่ค้างอยู่ - เรียกหลังสร้างงานหรือตอน server เริ่มทำงาน */
export function kickExportWorker(): void {
  // integration test เรียก processExportJob() เองเพื่อคุมลำดับ
  if (process.env.NODE_ENV === 'test') return

  const state = workerState()
  if (state.running) {
    state.again = true
    return
  }

  state.running = true
  void runWorker().finally(() => {
    state.running = false
  })
}

async function runWorker(): Promise<void> {
  const state = workerState()
  try {
    await resetStaleJobs()
    await cleanupExpiredExports()

    do {
      state.again = false
      while (true) {
        const job = await claimNextJob()
        if (!job) break
        await executeJob(job)
      }
    } while (state.again)
  } catch (err) {
    console.error('[export] worker error:', err)
  }
}

async function resetStaleJobs(): Promise<void> {
  await prisma.exportJob.updateMany({
    where: {
      status: 'RUNNING',
      startedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) },
    },
    data: { status: 'PENDING', startedAt: null, progress: 0 },
  })
}

async function cleanupExpiredExports(): Promise<void> {
  const expired = await prisma.exportJob.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true, format: true },
  })
  if (expired.length === 0) return

  await Promise.all(expired.map((job) => removeExportFile(job.id, job.format).catch(() => {})))
  await prisma.exportJob.deleteMany({
    where: { id: { in: expired.map((job) => job.id) } },
  })
}
