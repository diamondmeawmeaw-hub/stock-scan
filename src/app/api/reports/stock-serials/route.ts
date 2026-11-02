import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findMissingUnitIds } from '@/lib/scan-service'

export const runtime = 'nodejs'

const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 200

const querySchema = z.object({
  productId: z.string().min(1),
  categoryId: z.string().nullable(),
  brand: z.string().nullable(),
  vendorId: z.string().nullable(),
  q: z.string().nullable(),
  customerId: z.string().nullable(),
  timePeriod: z.string().nullable(),
  status: z.enum(['IN_STOCK', 'OUT']).default('IN_STOCK'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
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
      page: params.get('page') ?? '1',
      pageSize: params.get('pageSize') ?? String(DEFAULT_PAGE_SIZE),
    })

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
      return emptyResponse(input.pageSize)
    }

    const unitWhere: Prisma.SerialUnitWhereInput = {
      productId: input.productId,
      status: input.status,
      ...(input.vendorId ? { vendorId: input.vendorId } : {}),
    }

    // หมายเหตุ: ไม่กรอง receivedAt/releasedAt ตาม timePeriod ที่ระดับ serial
    // เพราะรายงานสรุปกรอง "สินค้าที่มีกิจกรรมในช่วง" แล้วแสดงยอดคงเหลือ/เบิกออกทั้งหมด
    // รายละเอียด serial จึงต้องแสดงทั้งหมดของสินค้านั้นเพื่อให้ยอดตรงกับรายงานสรุป

    // กรองลูกค้าที่ระดับ query - เอาเฉพาะ serial ที่ยังไม่ถูกคืน
    if (input.customerId) {
      const customerLogs = await prisma.scanLog.findMany({
        where: {
          productId: input.productId,
          accepted: true,
          type: 'OUT',
          customerId: input.customerId,
          reversedBy: null,
          serial: { not: null },
        },
        select: { serial: true },
        distinct: ['serial'],
      })
      const customerSerials = customerLogs
        .map((log) => log.serial)
        .filter((serial): serial is string => !!serial)

      if (customerSerials.length === 0) {
        return {
          ...emptyResponse(input.pageSize),
          product: productResponse(product),
        }
      }

      unitWhere.serial = { in: customerSerials }
    }

    // ของหายจากการตรวจนับไม่ใช่ "เบิกออก" - ตัดออกตั้งแต่ query เพื่อให้ total ตรงกับรายการ
    if (input.status === 'OUT') {
      const missing = await findMissingUnitIds()
      if (missing.size > 0) {
        unitWhere.id = { notIn: [...missing] }
      }
    }

    const total = await prisma.serialUnit.count({ where: unitWhere })
    const totalPages = Math.ceil(total / input.pageSize)
    const page = totalPages === 0 ? 1 : Math.min(input.page, totalPages)

    const units =
      total === 0
        ? []
        : await prisma.serialUnit.findMany({
            where: unitWhere,
            include: { vendor: { select: { name: true } } },
            orderBy: { serial: 'asc' },
            skip: (page - 1) * input.pageSize,
            take: input.pageSize,
          })

    // ดึงประวัติเฉพาะ serial ในหน้านี้ ไม่ใช่ทั้งสินค้า
    const serialList = units.map((u) => u.serial)
    const logs =
      serialList.length > 0
        ? await prisma.scanLog.findMany({
            where: {
              serial: { in: serialList },
              accepted: true,
            },
            orderBy: { createdAt: 'desc' },
            include: {
              user: { select: { displayName: true } },
              customer: { select: { code: true, name: true } },
              // ต้องรู้ว่าการเบิกครั้งล่าสุดถูกคืนแล้วหรือยัง ก่อนจะแสดงชื่อผู้ซื้อ
              reversedBy: { select: { id: true } },
            },
          })
        : []

    const logsBySerial = new Map<string, typeof logs>()
    for (const log of logs) {
      if (!log.serial) continue
      const list = logsBySerial.get(log.serial) ?? []
      list.push(log)
      logsBySerial.set(log.serial, list)
    }

    const result = units.map((u) => {
      const serialLogs = logsBySerial.get(u.serial) ?? []
      const outLog = serialLogs.find((l) => l.type === 'OUT' && !l.reversedBy)
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
      product: productResponse(product),
      serials: result,
      total,
      page,
      pageSize: input.pageSize,
      totalPages,
    }
  })
}

function emptyResponse(pageSize: number) {
  return {
    product: null,
    serials: [],
    total: 0,
    page: 1,
    pageSize,
    totalPages: 0,
  }
}

function productResponse(product: {
  id: string
  sku: string
  name: string
  brand: string | null
  category: { name: string }
}) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    categoryName: product.category.name,
  }
}
