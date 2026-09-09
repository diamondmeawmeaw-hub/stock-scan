import { z } from 'zod'
import { route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { StockReportFilters } from '@/lib/scan-service'

export const runtime = 'nodejs'

const querySchema = z.object({
  productId: z.string().min(1),
  categoryId: z.string().nullable(),
  brand: z.string().nullable(),
  vendorId: z.string().nullable(),
  q: z.string().nullable(),
  customerId: z.string().nullable(),
  timePeriod: z.string().nullable(),
  status: z.enum(['IN_STOCK', 'OUT']).default('IN_STOCK'),
})

export async function GET(request: Request) {
  return route(async () => {
    await requireUser()
    const params = new URL(request.url).searchParams
    const input = querySchema.parse({
      productId: params.get('productId') ?? '',
      categoryId: params.get('categoryId'),
      brand: params.get('brand'),
      vendorId: params.get('vendorId'),
      q: params.get('q'),
      customerId: params.get('customerId'),
      timePeriod: params.get('timePeriod'),
      status: params.get('status') ?? 'IN_STOCK',
    })

    const filters: StockReportFilters = {
      categoryId: input.categoryId,
      brand: input.brand,
      vendorId: input.vendorId,
      q: input.q,
      customerId: input.customerId,
      timePeriod: (input.timePeriod || '30d') as StockReportFilters['timePeriod'],
    }

    // Verify product exists and passes filters
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: {
        id: true,
        sku: true,
        name: true,
        brand: true,
        category: { select: { id: true, name: true, code: true } },
      },
    })

    if (!product) {
      return { serials: [], product: null }
    }

    // Get units for this product with vendor info — ตาม status ที่ระบุ
    const units = await prisma.serialUnit.findMany({
      where: {
        productId: input.productId,
        status: input.status,
        ...(input.vendorId ? { vendorId: input.vendorId } : {}),
      },
      include: {
        vendor: { select: { name: true } },
      },
      orderBy: { serial: 'asc' },
    })

    // Get all serials to filter by timePeriod and customerId
    const serials = units.map((u) => u.serial)

    // If timePeriod or customerId filter, need to check scan logs + receivedAt
    let filteredSerials: Set<string> | null = null

    if (filters.timePeriod && filters.timePeriod !== 'all') {
      const { timePeriodRange } = await import('@/lib/date-range')
      const range = timePeriodRange(filters.timePeriod)
      if (range) {
        // นับทั้ง serial ที่มี movement ใน period (ScanLog) และ serial ที่รับเข้าใน period (receivedAt)
        const [scanLogs, receivedUnits] = await Promise.all([
          prisma.scanLog.findMany({
            where: {
              serial: { in: serials },
              accepted: true,
              createdAt: { gte: range.from, lte: range.to },
            },
            select: { serial: true },
          }),
          prisma.serialUnit.findMany({
            where: {
              serial: { in: serials },
              receivedAt: { gte: range.from, lte: range.to },
            },
            select: { serial: true },
          }),
        ])
        filteredSerials = new Set([
          ...scanLogs.map((l) => l.serial),
          ...receivedUnits.map((u) => u.serial),
        ])
      }
    }

    if (filters.customerId) {
      const logs = await prisma.scanLog.findMany({
        where: {
          serial: { in: serials },
          accepted: true,
          type: 'OUT',
          customerId: filters.customerId,
        },
        select: { serial: true },
      })
      const customerSerials = new Set(logs.map((l) => l.serial))
      filteredSerials = filteredSerials
        ? new Set([...filteredSerials].filter((s) => customerSerials.has(s)))
        : customerSerials
    }

    // If no filter, get all serials
    const filteredUnits = filteredSerials
      ? units.filter((u) => filteredSerials!.has(u.serial))
      : units

    // Get scan logs for history
    const serialList = filteredUnits.map((u) => u.serial)
    const logs = serialList.length > 0
      ? await prisma.scanLog.findMany({
          where: {
            serial: { in: serialList },
            accepted: true,
          },
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { displayName: true } },
            customer: { select: { code: true, name: true } },
          },
        })
      : []

    // Group logs by serial and find latest OUT log for each serial
    const logsBySerial = new Map<string, typeof logs>()
    for (const log of logs) {
      const list = logsBySerial.get(log.serial) ?? []
      list.push(log)
      logsBySerial.set(log.serial, list)
    }

    const result = filteredUnits.map((u) => {
      const serialLogs = logsBySerial.get(u.serial) ?? []
      const outLog = serialLogs.find((l) => l.type === 'OUT')
      const customerName = outLog?.customer
        ? `${outLog.customer.code} · ${outLog.customer.name}`
        : null

      return {
        serial: u.serial,
        status: u.status,
        receivedAt: u.receivedAt?.toISOString() ?? null,
        releasedAt: u.releasedAt?.toISOString() ?? null,
        vendorName: u.vendor?.name ?? null,
        customerName,
        history: serialLogs.map((l) => ({
          id: l.id,
          type: l.type,
          result: l.result,
          reason: l.reason,
          at: l.createdAt.toISOString(),
          userName: l.user.displayName,
        })),
      }
    })

    return {
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        categoryName: product.category.name,
      },
      serials: result,
    }
  })
}
