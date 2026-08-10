import { Prisma } from '@prisma/client'
import { HttpError } from './auth'
import { prisma } from './prisma'
import {
  decideAuditScan,
  decideScanIn,
  decideScanOut,
  diffAudit,
  normalizeSerial,
  validateSerial,
  type ScanResultCode,
  type UnitSnapshot,
  type UnitStatusCode,
  type OutReasonCode,
} from './scan-rules'

export type { OutReasonCode }

export type ScanOutcome = {
  accepted: boolean
  result: ScanResultCode
  message: string
  serial: string
  product: { id: string; sku: string; name: string; categoryName: string } | null
  unitId: string | null
  scanLogId: string | null
  /** จำนวนคงเหลือของสินค้าตัวนี้หลังสแกน - ใช้โชว์บนหน้าจอสแกน */
  productInStock?: number
}

const unitInclude = {
  product: { include: { category: true } },
  vendor: { select: { code: true, name: true } },
} satisfies Prisma.SerialUnitInclude

type UnitWithProduct = Prisma.SerialUnitGetPayload<{ include: typeof unitInclude }>

function toSnapshot(unit: UnitWithProduct | null): UnitSnapshot | null {
  if (!unit) return null
  return {
    id: unit.id,
    serial: unit.serial,
    productId: unit.productId,
    status: unit.status,
    productName: unit.product.name,
    categoryId: unit.product.categoryId,
  }
}

/**
 * จองสิทธิ์ทำงานกับ serial นี้ไว้จนจบ transaction
 *
 * สองคนยิงของชิ้นเดียวกันพร้อมกันได้จริง (คนละเครื่องสแกน) ถ้าไม่ล็อกไว้
 * ทั้งคู่จะอ่านสถานะเดิมเหมือนกันแล้วตัดสินผลผิด เช่น เบิกออกสำเร็จทั้งคู่
 * หรือสร้าง serial ใหม่ชนกันจนติด unique constraint
 * ล็อกนี้ปลดเองอัตโนมัติเมื่อ transaction จบ (commit หรือ rollback ก็ตาม)
 */
async function lockSerial(tx: Prisma.TransactionClient, serial: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${serial}))`
}

/** serial ที่รูปแบบผิดตั้งแต่แรก - ตีกลับโดยไม่บันทึกลง ScanLog เพื่อไม่ให้ log เต็มไปด้วยขยะ */
function rejectedOutcome(serial: string, message: string): ScanOutcome {
  return {
    accepted: false,
    result: 'UNKNOWN_SERIAL',
    message,
    serial,
    product: null,
    unitId: null,
    scanLogId: null,
  }
}

// ────────────────────────────── รับเข้าสต็อก ──────────────────────────────

export async function scanIn(input: {
  rawSerial: string
  productId: string
  userId: string
  vendorId?: string | null
  note?: string | null
}): Promise<ScanOutcome> {
  const validation = validateSerial(input.rawSerial)
  if (!validation.ok) return rejectedOutcome(input.rawSerial.trim(), validation.message)
  const serial = validation.serial

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { category: true },
  })
  if (!product) throw new HttpError(400, 'ไม่พบสินค้าที่เลือกไว้')

  const vendorId = input.vendorId ?? null
  if (vendorId) {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
    if (!vendor) throw new HttpError(400, 'ไม่พบผู้ขายที่เลือกไว้')
    if (!vendor.active) throw new HttpError(400, `ผู้ขาย "${vendor.name}" ถูกปิดใช้งานอยู่`)
  }

  const productInfo = {
    id: product.id,
    sku: product.sku,
    name: product.name,
    categoryName: product.category.name,
  }

  const outcome = await prisma.$transaction(async (tx) => {
    await lockSerial(tx, serial)
    const unit = await tx.serialUnit.findUnique({ where: { serial }, include: unitInclude })
    const decision = decideScanIn(toSnapshot(unit), product.id)
    const now = new Date()

    let unitId = unit?.id ?? null
    if (decision.accepted) {
      if (decision.result === 'CREATED') {
        const created = await tx.serialUnit.create({
          data: {
            serial,
            productId: product.id,
            status: 'IN_STOCK',
            vendorId,
            receivedAt: now,
            lastScanAt: now,
          },
        })
        unitId = created.id
      } else {
        await tx.serialUnit.update({
          where: { id: unit!.id },
          data: {
            status: 'IN_STOCK',
            receivedAt: now,
            releasedAt: null,
            lastScanAt: now,
            // รับกลับเข้ามาโดยไม่ระบุผู้ขาย ให้คงเจ้าเดิมไว้ ดีกว่าล้างทิ้ง
            ...(vendorId ? { vendorId } : {}),
          },
        })
        unitId = unit!.id
      }
    }

    const log = await tx.scanLog.create({
      data: {
        serial,
        type: 'IN',
        result: decision.result,
        accepted: decision.accepted,
        message: decision.message,
        note: input.note ?? null,
        userId: input.userId,
        productId: product.id,
        unitId,
        vendorId,
      },
    })

    return {
      accepted: decision.accepted,
      result: decision.result,
      message: decision.message,
      serial,
      product: productInfo,
      unitId,
      scanLogId: log.id,
    } satisfies ScanOutcome
  })

  return withStockCount(outcome)
}

// ────────────────────────────── เบิกออก ──────────────────────────────

export async function scanOut(input: {
  rawSerial: string
  userId: string
  reason: OutReasonCode
  note?: string | null
}): Promise<ScanOutcome> {
  const validation = validateSerial(input.rawSerial)
  if (!validation.ok) return rejectedOutcome(input.rawSerial.trim(), validation.message)
  const serial = validation.serial

  const outcome = await prisma.$transaction(async (tx) => {
    await lockSerial(tx, serial)
    const unit = await tx.serialUnit.findUnique({ where: { serial }, include: unitInclude })
    const decision = decideScanOut(toSnapshot(unit))
    const now = new Date()

    if (decision.accepted && unit) {
      await tx.serialUnit.update({
        where: { id: unit.id },
        data: { status: 'OUT', releasedAt: now, lastScanAt: now },
      })
    }

    const log = await tx.scanLog.create({
      data: {
        serial,
        type: 'OUT',
        result: decision.result,
        accepted: decision.accepted,
        message: decision.message,
        reason: input.reason,
        note: input.note ?? null,
        userId: input.userId,
        productId: unit?.productId ?? null,
        unitId: unit?.id ?? null,
      },
    })

    return {
      accepted: decision.accepted,
      result: decision.result,
      message: decision.message,
      serial,
      product: unit
        ? {
            id: unit.product.id,
            sku: unit.product.sku,
            name: unit.product.name,
            categoryName: unit.product.category.name,
          }
        : null,
      unitId: unit?.id ?? null,
      scanLogId: log.id,
    } satisfies ScanOutcome
  })

  return withStockCount(outcome)
}

async function withStockCount(outcome: ScanOutcome): Promise<ScanOutcome> {
  if (!outcome.product) return outcome
  const productInStock = await prisma.serialUnit.count({
    where: { productId: outcome.product.id, status: 'IN_STOCK' },
  })
  return { ...outcome, productInStock }
}

// ────────────────────────────── ตรวจนับสต็อก ──────────────────────────────

export async function openAuditSession(input: {
  name: string
  categoryId?: string | null
  userId: string
  note?: string | null
}) {
  const existingOpen = await prisma.auditSession.findFirst({ where: { status: 'OPEN' } })
  if (existingOpen) {
    throw new HttpError(
      409,
      `ยังมีรอบตรวจนับที่เปิดค้างอยู่ ("${existingOpen.name}") ปิดรอบเดิมก่อนจึงจะเปิดรอบใหม่ได้`
    )
  }
  if (input.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } })
    if (!category) throw new HttpError(400, 'ไม่พบประเภทของที่เลือก')
  }
  return prisma.auditSession.create({
    data: {
      name: input.name.trim(),
      categoryId: input.categoryId ?? null,
      startedById: input.userId,
      note: input.note ?? null,
    },
    include: { category: true },
  })
}

export async function auditScan(input: {
  sessionId: string
  rawSerial: string
  userId: string
}): Promise<ScanOutcome> {
  const session = await prisma.auditSession.findUnique({ where: { id: input.sessionId } })
  if (!session) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')
  if (session.status !== 'OPEN') throw new HttpError(409, 'รอบตรวจนับนี้ปิดไปแล้ว')

  const validation = validateSerial(input.rawSerial)
  if (!validation.ok) return rejectedOutcome(input.rawSerial.trim(), validation.message)
  const serial = validation.serial

  return prisma.$transaction(async (tx) => {
    await lockSerial(tx, serial)
    const unit = await tx.serialUnit.findUnique({ where: { serial }, include: unitInclude })
    const alreadyScanned =
      (await tx.scanLog.count({
        where: { auditSessionId: session.id, serial, accepted: true },
      })) > 0

    const decision = decideAuditScan(toSnapshot(unit), {
      scopeCategoryId: session.categoryId,
      alreadyScanned,
    })

    if (decision.accepted && unit) {
      await tx.serialUnit.update({ where: { id: unit.id }, data: { lastScanAt: new Date() } })
    }

    const log = await tx.scanLog.create({
      data: {
        serial,
        type: 'AUDIT',
        result: decision.result,
        accepted: decision.accepted,
        message: decision.message,
        userId: input.userId,
        productId: unit?.productId ?? null,
        unitId: unit?.id ?? null,
        auditSessionId: session.id,
      },
    })

    return {
      accepted: decision.accepted,
      result: decision.result,
      message: decision.message,
      serial,
      product: unit
        ? {
            id: unit.product.id,
            sku: unit.product.sku,
            name: unit.product.name,
            categoryName: unit.product.category.name,
          }
        : null,
      unitId: unit?.id ?? null,
      scanLogId: log.id,
    } satisfies ScanOutcome
  })
}

export type AuditUnitRow = {
  unitId: string
  serial: string
  sku: string
  productName: string
  categoryName: string
}

export type AuditReport = {
  sessionId: string
  name: string
  status: 'OPEN' | 'CLOSED'
  categoryId: string | null
  categoryName: string | null
  startedAt: string
  closedAt: string | null
  expectedCount: number
  scannedCount: number
  matchedCount: number
  missing: AuditUnitRow[] // ของหาย: ระบบว่ามีแต่ยิงไม่เจอ
  surplus: AuditUnitRow[] // ของเกิน: ยิงเจอแต่ระบบว่าเบิกออกไปแล้ว
  unknownSerials: { serial: string; scannedAt: string }[] // ยิงแล้วระบบไม่รู้จัก
}

/** คำนวณผลรอบตรวจนับ (รอบที่ปิดแล้วจะคืน snapshot ที่เก็บไว้) */
export async function buildAuditReport(sessionId: string): Promise<AuditReport> {
  const session = await prisma.auditSession.findUnique({
    where: { id: sessionId },
    include: { category: true },
  })
  if (!session) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')

  if (session.status === 'CLOSED' && session.report) {
    return session.report as unknown as AuditReport
  }

  const expectedUnits = await prisma.serialUnit.findMany({
    where: {
      status: 'IN_STOCK',
      ...(session.categoryId ? { product: { categoryId: session.categoryId } } : {}),
    },
    include: unitInclude,
  })

  const acceptedScans = await prisma.scanLog.findMany({
    where: { auditSessionId: session.id, accepted: true, unitId: { not: null } },
    include: { unit: { include: unitInclude } },
  })

  const scannedUnits = new Map<string, UnitWithProduct>()
  for (const log of acceptedScans) {
    if (log.unit) scannedUnits.set(log.unit.id, log.unit)
  }

  const diff = diffAudit({
    expectedUnitIds: expectedUnits.map((u) => u.id),
    scannedUnitIds: [...scannedUnits.keys()],
  })

  const byId = new Map<string, UnitWithProduct>()
  for (const u of expectedUnits) byId.set(u.id, u)
  for (const [id, u] of scannedUnits) byId.set(id, u)

  const toRow = (unitId: string): AuditUnitRow => {
    const u = byId.get(unitId)!
    return {
      unitId,
      serial: u.serial,
      sku: u.product.sku,
      productName: u.product.name,
      categoryName: u.product.category.name,
    }
  }

  const unknownLogs = await prisma.scanLog.findMany({
    where: { auditSessionId: session.id, result: 'UNKNOWN_SERIAL' },
    orderBy: { createdAt: 'asc' },
    distinct: ['serial'],
  })

  return {
    sessionId: session.id,
    name: session.name,
    status: session.status,
    categoryId: session.categoryId,
    categoryName: session.category?.name ?? null,
    startedAt: session.startedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    expectedCount: diff.expectedCount,
    scannedCount: diff.scannedCount,
    matchedCount: diff.matchedUnitIds.length,
    missing: diff.missingUnitIds.map(toRow).sort(sortRows),
    surplus: diff.surplusUnitIds.map(toRow).sort(sortRows),
    unknownSerials: unknownLogs.map((l) => ({
      serial: l.serial,
      scannedAt: l.createdAt.toISOString(),
    })),
  }
}

function sortRows(a: AuditUnitRow, b: AuditUnitRow) {
  return a.productName.localeCompare(b.productName, 'th') || a.serial.localeCompare(b.serial)
}

/**
 * ปิดรอบตรวจนับ พร้อมเก็บ snapshot ของผลไว้
 * applyAdjustments = true จะปรับสต็อกตามผลนับจริง (ของหาย -> OUT, ของเกิน -> IN_STOCK)
 */
export async function closeAuditSession(input: {
  sessionId: string
  userId: string
  applyAdjustments: boolean
}): Promise<AuditReport> {
  const session = await prisma.auditSession.findUnique({ where: { id: input.sessionId } })
  if (!session) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')
  if (session.status === 'CLOSED') throw new HttpError(409, 'รอบตรวจนับนี้ปิดไปแล้ว')

  const report = await buildAuditReport(input.sessionId)
  const closedAt = new Date()
  const finalReport: AuditReport = { ...report, status: 'CLOSED', closedAt: closedAt.toISOString() }

  await prisma.$transaction(async (tx) => {
    if (input.applyAdjustments) {
      if (report.missing.length > 0) {
        const missingIds = report.missing.map((r) => r.unitId)
        const missingUnits = await tx.serialUnit.findMany({
          where: { id: { in: missingIds } },
          select: { id: true, serial: true, productId: true },
        })
        // log ก่อนตัดออก เพื่อให้ย้อนดูได้ว่าของหายจากรอบตรวจนับไหน ไม่ใช่เบิกออกตามปกติ
        await tx.scanLog.createMany({
          data: missingUnits.map((u) => ({
            serial: u.serial,
            type: 'AUDIT' as const,
            result: 'MISSING' as const,
            accepted: true,
            message: `นับไม่เจอในรอบ "${session.name}" - ตัดออกจากคลัง`,
            userId: input.userId,
            productId: u.productId,
            unitId: u.id,
            auditSessionId: input.sessionId,
          })),
        })
        await tx.serialUnit.updateMany({
          where: { id: { in: missingIds } },
          data: { status: 'OUT', releasedAt: closedAt },
        })
      }
      if (report.surplus.length > 0) {
        // ของเกินมี log FOUND_BUT_OUT จากตอนยิงสแกนอยู่แล้ว ไม่ต้องเขียนซ้ำ
        await tx.serialUnit.updateMany({
          where: { id: { in: report.surplus.map((r) => r.unitId) } },
          data: { status: 'IN_STOCK', receivedAt: closedAt, releasedAt: null },
        })
      }
    }

    await tx.auditSession.update({
      where: { id: input.sessionId },
      data: {
        status: 'CLOSED',
        closedAt,
        report: finalReport as unknown as Prisma.InputJsonValue,
      },
    })
  })

  return finalReport
}

// ────────────────────────────── รายงานคงเหลือ ──────────────────────────────

export type StockReportFilters = {
  categoryId?: string | null
  brand?: string | null
  /** กรองเฉพาะของที่รับเข้ามาจากผู้ขายรายนี้ */
  vendorId?: string | null
  /** ค้นหาตามชื่อสินค้า / SKU / แบรนด์ */
  q?: string | null
}

export type StockReportRow = {
  categoryId: string
  categoryCode: string
  categoryName: string
  products: {
    productId: string
    sku: string
    name: string
    brand: string | null
    inStock: number
    out: number
  }[]
  totalInStock: number
}

function productFilter(filters: StockReportFilters): Prisma.ProductWhereInput | undefined {
  const and: Prisma.ProductWhereInput[] = []
  if (filters.categoryId) and.push({ categoryId: filters.categoryId })
  if (filters.brand) and.push({ brand: filters.brand })
  const q = filters.q?.trim()
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
      ],
    })
  }
  return and.length > 0 ? { AND: and } : undefined
}

export async function buildStockReport(filters: StockReportFilters = {}): Promise<{
  categories: StockReportRow[]
  grandTotalInStock: number
}> {
  const where = productFilter(filters)
  const vendorId = filters.vendorId || null
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: {
      products: {
        where,
        orderBy: { name: 'asc' },
        include: {
          units: { where: vendorId ? { vendorId } : undefined, select: { status: true } },
        },
      },
    },
  })

  const rows: StockReportRow[] = categories.map((c) => {
    const products = c.products.map((p) => {
      const inStock = p.units.filter((u) => u.status === 'IN_STOCK').length
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        inStock,
        out: p.units.length - inStock,
      }
    })
    return {
      categoryId: c.id,
      categoryCode: c.code,
      categoryName: c.name,
      products,
      totalInStock: products.reduce((sum, p) => sum + p.inStock, 0),
    }
  })

  // มีตัวกรองอยู่ = ซ่อนประเภทที่ไม่มีสินค้าเข้าเงื่อนไข ไม่ให้รกจอ
  // กรองตามผู้ขายก็ต้องตัดสินค้าที่ไม่เคยรับจากเจ้านี้ออกด้วย ไม่งั้นจะเห็นเลข 0 เต็มไปหมด
  const filtered = vendorId
    ? rows
        .map((r) => {
          const products = r.products.filter((p) => p.inStock + p.out > 0)
          return {
            ...r,
            products,
            totalInStock: products.reduce((sum, p) => sum + p.inStock, 0),
          }
        })
        .filter((r) => r.products.length > 0)
    : rows
  const visible = where ? filtered.filter((r) => r.products.length > 0) : filtered

  return {
    categories: visible,
    grandTotalInStock: visible.reduce((sum, r) => sum + r.totalInStock, 0),
  }
}

/** รายการแบรนด์ที่มีอยู่จริงในระบบ - ใช้เติม dropdown ตัวกรอง */
export async function listBrands(): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { brand: { not: null } },
    distinct: ['brand'],
    orderBy: { brand: 'asc' },
    select: { brand: true },
  })
  return rows.map((r) => r.brand!).filter((b) => b.length > 0)
}

/** ผู้ขายที่ยังเปิดใช้งาน + เจ้าที่ปิดไปแล้วแต่ยังมีของค้างอยู่ - ใช้เติม dropdown ตัวกรอง */
export async function listVendors(): Promise<{ id: string; code: string; name: string }[]> {
  return prisma.vendor.findMany({
    where: { OR: [{ active: true }, { units: { some: {} } }] },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true },
  })
}

// ─────────────────────── ค้นหาตาม serial ───────────────────────

export type SerialSearchRow = {
  serial: string
  status: UnitStatusCode
  sku: string
  productName: string
  brand: string | null
  categoryName: string
  vendorName: string | null
  receivedAt: string | null
  releasedAt: string | null
}

export type SerialHistoryEntry = {
  id: string
  type: 'IN' | 'OUT' | 'AUDIT'
  result: ScanResultCode | 'MISSING'
  accepted: boolean
  message: string | null
  reason: OutReasonCode | null
  note: string | null
  userName: string
  productName: string | null
  vendorName: string | null
  auditSessionName: string | null
  at: string
}

const scanLogInclude = {
  user: { select: { displayName: true } },
  product: { select: { name: true } },
  vendor: { select: { name: true } },
  auditSession: { select: { name: true } },
} satisfies Prisma.ScanLogInclude

type ScanLogWithRelations = Prisma.ScanLogGetPayload<{ include: typeof scanLogInclude }>

function toHistoryEntry(log: ScanLogWithRelations): SerialHistoryEntry {
  return {
    id: log.id,
    type: log.type,
    result: log.result,
    accepted: log.accepted,
    message: log.message,
    reason: log.reason,
    note: log.note,
    userName: log.user.displayName,
    productName: log.product?.name ?? null,
    vendorName: log.vendor?.name ?? null,
    auditSessionName: log.auditSession?.name ?? null,
    at: log.createdAt.toISOString(),
  }
}

export type SerialDetail = {
  serial: string
  /** null = ไม่เคยมี serial นี้ในคลัง แต่มีคนเคยยิง (เช่น ยิงผิด/ยังไม่ได้รับเข้า) */
  unit: {
    id: string
    status: UnitStatusCode
    sku: string
    productName: string
    brand: string | null
    categoryName: string
    vendorName: string | null
    receivedAt: string | null
    releasedAt: string | null
    lastScanAt: string | null
  } | null
  history: SerialHistoryEntry[]
}

const SEARCH_LIMIT = 50

/**
 * ค้นหา serial แบบบางส่วน - ใช้ตอนคนพิมพ์เองแทนที่จะยิงด้วยเครื่องสแกน
 * ไม่ผ่าน validateSerial เพราะคำค้นสั้นๆ ก็ต้องหาเจอ
 */
export async function searchSerials(rawQuery: string): Promise<SerialSearchRow[]> {
  const q = rawQuery.trim().toUpperCase()
  if (!q) return []

  const units = await prisma.serialUnit.findMany({
    where: { serial: { contains: q, mode: 'insensitive' } },
    include: unitInclude,
    orderBy: { serial: 'asc' },
    take: SEARCH_LIMIT,
  })

  return units.map((u) => ({
    serial: u.serial,
    status: u.status,
    sku: u.product.sku,
    productName: u.product.name,
    brand: u.product.brand,
    categoryName: u.product.category.name,
    vendorName: u.vendor?.name ?? null,
    receivedAt: u.receivedAt?.toISOString() ?? null,
    releasedAt: u.releasedAt?.toISOString() ?? null,
  }))
}

/**
 * ประวัติทั้งหมดของ serial หนึ่งตัว - รับเข้าวันไหน เบิกออกวันไหน ใครทำ
 *
 * ดึง log ด้วยตัว serial ไม่ใช่ unitId เพื่อให้เห็นครั้งที่ระบบปฏิเสธด้วย
 * (เช่น ยิงเบิกออกซ้ำ หรือยิงตอนที่ยังไม่ได้รับเข้าระบบ) ซึ่งยังไม่มี unit ผูกอยู่
 */
export async function lookupSerial(rawSerial: string): Promise<SerialDetail> {
  const serial = normalizeSerial(rawSerial ?? '')
  if (!serial) throw new HttpError(400, 'ต้องระบุ serial ที่จะค้นหา')

  const [unit, logs] = await Promise.all([
    prisma.serialUnit.findUnique({ where: { serial }, include: unitInclude }),
    prisma.scanLog.findMany({
      where: { serial },
      orderBy: { createdAt: 'desc' },
      include: scanLogInclude,
    }),
  ])

  return {
    serial,
    unit: unit
      ? {
          id: unit.id,
          status: unit.status,
          sku: unit.product.sku,
          productName: unit.product.name,
          brand: unit.product.brand,
          categoryName: unit.product.category.name,
          vendorName: unit.vendor?.name ?? null,
          receivedAt: unit.receivedAt?.toISOString() ?? null,
          releasedAt: unit.releasedAt?.toISOString() ?? null,
          lastScanAt: unit.lastScanAt?.toISOString() ?? null,
        }
      : null,
    history: logs.map(toHistoryEntry),
  }
}

// ─────────────────────── ประวัติการสแกนทั้งระบบ ───────────────────────

export type ScanLogFilters = {
  /** คำค้นบางส่วนของ serial (ยิงเครื่องสแกนมาก็ใช้ได้ เพราะ contains ครอบเคสตรงเป๊ะอยู่แล้ว) */
  q?: string | null
  type?: 'IN' | 'OUT' | 'AUDIT' | null
  userId?: string | null
  from?: Date | null
  to?: Date | null
  page?: number | null
}

export type ScanLogPage = {
  rows: (SerialHistoryEntry & { serial: string })[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const SCAN_LOG_PAGE_SIZE = 50

/**
 * ประวัติการสแกนทั้งระบบแบบแบ่งหน้า - ต่างจาก lookupSerial() ตรงที่ไม่ผูกกับ serial เดียว
 * ใช้ตอบคำถามแบบ "เมื่อวานใครยิงเบิกออกอะไรไปบ้าง"
 */
export async function listScanLogs(filters: ScanLogFilters = {}): Promise<ScanLogPage> {
  if (filters.from && filters.to && filters.from > filters.to) {
    throw new HttpError(400, 'วันเริ่มต้นต้องไม่เกินวันสิ้นสุด')
  }

  const q = filters.q?.trim()
  const where: Prisma.ScanLogWhereInput = {
    ...(q ? { serial: { contains: q, mode: 'insensitive' } } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  }

  const total = await prisma.scanLog.count({ where })
  const totalPages = Math.max(1, Math.ceil(total / SCAN_LOG_PAGE_SIZE))
  // กันเคสกดหน้า 5 อยู่แล้วเปลี่ยนตัวกรองจนเหลือ 2 หน้า - ดึงหน้าสุดท้ายมาแทนตารางเปล่า
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages)

  const logs = await prisma.scanLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: scanLogInclude,
    skip: (page - 1) * SCAN_LOG_PAGE_SIZE,
    take: SCAN_LOG_PAGE_SIZE,
  })

  return {
    rows: logs.map((l) => ({ ...toHistoryEntry(l), serial: l.serial })),
    total,
    page,
    pageSize: SCAN_LOG_PAGE_SIZE,
    totalPages,
  }
}

/** ผู้ใช้ที่เคยยิงสแกนจริง - ใช้เติม dropdown ตัวกรองผู้สแกน */
export async function listScanUsers(): Promise<{ id: string; displayName: string }[]> {
  return prisma.user.findMany({
    where: { scanLogs: { some: {} } },
    orderBy: { displayName: 'asc' },
    select: { id: true, displayName: true },
  })
}

// ─────────────────────── รายงานความเคลื่อนไหวตามช่วงวัน ───────────────────────

export type MovementReportRow = {
  productId: string
  sku: string
  name: string
  brand: string | null
  categoryName: string
  inCount: number
  outCount: number
}

export type MovementReport = {
  from: string
  to: string
  rows: MovementReportRow[]
  totalIn: number
  totalOut: number
}

/**
 * นับของที่รับเข้า/เบิกออกในช่วงวันที่ที่เลือก แยกตามสินค้า
 * นับจาก ScanLog ที่ระบบรับไว้เท่านั้น (accepted) รายการที่ถูกปฏิเสธไม่ทำให้ยอดขยับ
 */
export async function buildMovementReport(
  input: StockReportFilters & { from: Date; to: Date }
): Promise<MovementReport> {
  if (input.from > input.to) throw new HttpError(400, 'วันเริ่มต้นต้องไม่เกินวันสิ้นสุด')

  const product = productFilter(input)
  const grouped = await prisma.scanLog.groupBy({
    by: ['productId', 'type'],
    where: {
      type: { in: ['IN', 'OUT'] },
      accepted: true,
      createdAt: { gte: input.from, lte: input.to },
      productId: { not: null },
      ...(input.vendorId ? { vendorId: input.vendorId } : {}),
      ...(product ? { product } : {}),
    },
    _count: { _all: true },
  })

  const productIds = [...new Set(grouped.map((g) => g.productId!))]
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { category: true },
  })

  const rows = products
    .map((p) => {
      const forProduct = grouped.filter((g) => g.productId === p.id)
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        categoryName: p.category.name,
        inCount: forProduct.find((g) => g.type === 'IN')?._count._all ?? 0,
        outCount: forProduct.find((g) => g.type === 'OUT')?._count._all ?? 0,
      }
    })
    .sort(
      (a, b) =>
        a.categoryName.localeCompare(b.categoryName, 'th') || a.name.localeCompare(b.name, 'th')
    )

  return {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    rows,
    totalIn: rows.reduce((sum, r) => sum + r.inCount, 0),
    totalOut: rows.reduce((sum, r) => sum + r.outCount, 0),
  }
}

