import { Prisma } from '@prisma/client'
import { HttpError } from './auth'
import { prisma } from './prisma'
import {
  QUANTITY_MAX,
  decideAuditScan,
  decideScanIn,
  decideScanOut,
  diffAudit,
  normalizeSerial,
  validateQuantity,
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
  /** serial ที่ยิง - รายการของสินค้าแบบ QUANTITY ไม่มี serial จะเป็น sku แทนไว้โชว์บนจอ */
  serial: string
  /** จำนวนที่ขยับในรายการนี้ (สินค้าแบบ QUANTITY) - ของ SERIAL เป็น 1 เสมอ */
  quantity?: number
  product: {
    id: string
    sku: string
    name: string
    categoryName: string
    trackingType?: 'SERIAL' | 'QUANTITY'
    unitLabel?: string | null
  } | null
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

/**
 * ล็อกระดับสินค้าแบบ QUANTITY - กันสองคนกรอกจำนวนของตัวเดียวกันพร้อมกันแล้วยอดหาย
 * (อ่าน stockQty เก่าพร้อมกันแล้วบวกทับกัน) ปลดเองเมื่อ transaction จบเหมือน lockSerial
 */
async function lockProduct(tx: Prisma.TransactionClient, productId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('qty:' || ${productId}))`
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
  if (product.trackingType === 'QUANTITY') {
    throw new HttpError(400, `สินค้า "${product.name}" นับเป็นจำนวน ให้กรอกจำนวนแทนการยิง serial`)
  }

  const vendorId = input.vendorId ?? null
  if (vendorId) {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
    if (!vendor) throw new HttpError(400, 'ไม่พบผู้จำหน่ายที่เลือกไว้')
    if (!vendor.active) throw new HttpError(400, `ผู้จำหน่าย "${vendor.name}" ถูกปิดใช้งานอยู่`)
  }

  const productInfo = {
    id: product.id,
    sku: product.sku,
    name: product.name,
    categoryName: product.category.name,
    trackingType: product.trackingType,
    unitLabel: product.unitLabel,
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
            // รับกลับเข้ามาโดยไม่ระบุผู้จำหน่าย ให้คงเจ้าเดิมไว้ ดีกว่าล้างทิ้ง
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
  customerId?: string | null
}): Promise<ScanOutcome> {
  const validation = validateSerial(input.rawSerial)
  if (!validation.ok) return rejectedOutcome(input.rawSerial.trim(), validation.message)
  const serial = validation.serial

  const customer = input.customerId
    ? await prisma.customer.findUnique({ where: { id: input.customerId } })
    : null
  if (input.customerId && (!customer || !customer.active)) {
    throw new HttpError(400, 'ไม่พบลูกค้าที่เลือกหรือถูกปิดใช้งานแล้ว')
  }

  const outcome = await prisma.$transaction(async (tx) => {
    await lockSerial(tx, serial)
    const unit = await tx.serialUnit.findUnique({ where: { serial }, include: unitInclude })
    if (unit?.product.trackingType === 'QUANTITY') {
      throw new HttpError(
        400,
        `สินค้า "${unit.product.name}" นับเป็นจำนวน ให้เลือกสินค้าแล้วกรอกจำนวนแทนการยิง serial`
      )
    }
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
        customerId: input.reason === 'SALE' ? input.customerId ?? null : null,
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
            trackingType: unit.product.trackingType,
            unitLabel: unit.product.unitLabel,
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
  const product = await prisma.product.findUnique({
    where: { id: outcome.product.id },
    select: { trackingType: true, stockQty: true },
  })
  if (product?.trackingType === 'QUANTITY') {
    return { ...outcome, productInStock: product.stockQty }
  }
  const productInStock = await prisma.serialUnit.count({
    where: { productId: outcome.product.id, status: 'IN_STOCK' },
  })
  return { ...outcome, productInStock }
}

// ────────────────────────────── สินค้านับจำนวน (ไม่มี serial) ──────────────────────────────

export type QuantityOutcome = {
  accepted: boolean
  result: 'OK'
  message: string
  quantity: number
  product: {
    id: string
    sku: string
    name: string
    categoryName: string
    trackingType: 'QUANTITY'
    unitLabel: string | null
  }
  scanLogId: string | null
  /** จำนวนคงเหลือของสินค้าตัวนี้หลังทำรายการ */
  productInStock: number
}

async function resolveQuantityVendor(vendorId: string | null | undefined): Promise<string | null> {
  const id = vendorId ?? null
  if (!id) return null
  const vendor = await prisma.vendor.findUnique({ where: { id } })
  if (!vendor) throw new HttpError(400, 'ไม่พบผู้จำหน่ายที่เลือกไว้')
  if (!vendor.active) throw new HttpError(400, `ผู้จำหน่าย "${vendor.name}" ถูกปิดใช้งานอยู่`)
  return id
}

async function resolveQuantityCustomer(
  customerId: string | null | undefined,
  reason: OutReasonCode
): Promise<string | null> {
  if (reason !== 'SALE') return null
  if (!customerId) return null
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer || !customer.active) {
    throw new HttpError(400, 'ไม่พบลูกค้าที่เลือกหรือถูกปิดใช้งานแล้ว')
  }
  return customer.id
}

function toQuantityProductInfo(product: {
  id: string
  sku: string
  name: string
  unitLabel: string | null
  category: { name: string }
}): QuantityOutcome['product'] {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    categoryName: product.category.name,
    trackingType: 'QUANTITY',
    unitLabel: product.unitLabel,
  }
}

/** รับเข้าสต็อกแบบกรอกจำนวน - สำหรับสินค้า trackingType QUANTITY เท่านั้น */
export async function quantityIn(input: {
  productId: string
  rawQuantity: unknown
  userId: string
  vendorId?: string | null
  note?: string | null
}): Promise<QuantityOutcome> {
  const check = validateQuantity(input.rawQuantity)
  if (!check.ok) throw new HttpError(400, check.message)
  const quantity = check.quantity

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { category: true },
  })
  if (!product) throw new HttpError(400, 'ไม่พบสินค้าที่เลือกไว้')
  if (product.trackingType !== 'QUANTITY') {
    throw new HttpError(400, `สินค้า "${product.name}" นับเป็นรายชิ้น ให้ยิง serial แทนการกรอกจำนวน`)
  }
  const vendorId = await resolveQuantityVendor(input.vendorId)

  const outcome = await prisma.$transaction(async (tx) => {
    await lockProduct(tx, product.id)
    const updated = await tx.product.update({
      where: { id: product.id },
      data: { stockQty: { increment: quantity } },
      select: { stockQty: true },
    })
    const log = await tx.scanLog.create({
      data: {
        serial: null,
        quantity,
        type: 'IN',
        result: 'OK',
        accepted: true,
        message: `รับเข้า ${quantity} ${product.unitLabel ?? 'ชิ้น'}`,
        note: input.note ?? null,
        userId: input.userId,
        productId: product.id,
        unitId: null,
        vendorId,
      },
    })
    return { productInStock: updated.stockQty, scanLogId: log.id }
  })

  return {
    accepted: true,
    result: 'OK',
    message: `รับเข้า ${product.name} ${quantity} ${product.unitLabel ?? 'ชิ้น'} (คงเหลือ ${outcome.productInStock})`,
    quantity,
    product: toQuantityProductInfo(product),
    scanLogId: outcome.scanLogId,
    productInStock: outcome.productInStock,
  }
}

/**
 * เบิกออกแบบกรอกจำนวน - ถ้าของในคลังไม่พอจะปฏิเสธทั้งรายการ (ไม่ติดลบ)
 * ถ้าสินค้าหมด (เหลือ 0) หน้าบ้านจะไม่ให้เลือกอยู่แล้ว ที่นี่กันซ้ำอีกชั้น
 */
export async function quantityOut(input: {
  productId: string
  rawQuantity: unknown
  userId: string
  reason: OutReasonCode
  note?: string | null
  customerId?: string | null
}): Promise<QuantityOutcome> {
  const check = validateQuantity(input.rawQuantity)
  if (!check.ok) throw new HttpError(400, check.message)
  const quantity = check.quantity

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { category: true },
  })
  if (!product) throw new HttpError(400, 'ไม่พบสินค้าที่เลือกไว้')
  if (product.trackingType !== 'QUANTITY') {
    throw new HttpError(400, `สินค้า "${product.name}" นับเป็นรายชิ้น ให้ยิง serial แทนการกรอกจำนวน`)
  }
  const customerId = await resolveQuantityCustomer(input.customerId, input.reason)

  const outcome = await prisma.$transaction(async (tx) => {
    await lockProduct(tx, product.id)
    const current = await tx.product.findUnique({
      where: { id: product.id },
      select: { stockQty: true },
    })
    const available = current?.stockQty ?? 0
    if (available < quantity) {
      throw new HttpError(
        400,
        `คงเหลือไม่พอ - "${product.name}" เหลือ ${available} ${product.unitLabel ?? 'ชิ้น'} แต่จะเบิก ${quantity}`
      )
    }
    const updated = await tx.product.update({
      where: { id: product.id },
      data: { stockQty: { decrement: quantity } },
      select: { stockQty: true },
    })
    const log = await tx.scanLog.create({
      data: {
        serial: null,
        quantity,
        type: 'OUT',
        result: 'OK',
        accepted: true,
        message: `เบิกออก ${quantity} ${product.unitLabel ?? 'ชิ้น'}`,
        reason: input.reason,
        note: input.note ?? null,
        userId: input.userId,
        productId: product.id,
        unitId: null,
        customerId,
      },
    })
    return { productInStock: updated.stockQty, scanLogId: log.id }
  })

  return {
    accepted: true,
    result: 'OK',
    message: `เบิกออก ${product.name} ${quantity} ${product.unitLabel ?? 'ชิ้น'} (คงเหลือ ${outcome.productInStock})`,
    quantity,
    product: toQuantityProductInfo(product),
    scanLogId: outcome.scanLogId,
    productInStock: outcome.productInStock,
  }
}

/** สินค้าแบบ QUANTITY ที่ยังพอมีให้เบิก - ใช้เติม dropdown หน้าเบิกออก */
export async function listQuantityProducts(): Promise<
  {
    id: string
    sku: string
    name: string
    categoryName: string
    unitLabel: string | null
    inStock: number
  }[]
> {
  const products = await prisma.product.findMany({
    where: { trackingType: 'QUANTITY' },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    include: { category: true },
  })
  return products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    categoryName: p.category.name,
    unitLabel: p.unitLabel,
    inStock: p.stockQty,
  }))
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
    if (unit?.product.trackingType === 'QUANTITY') {
      throw new HttpError(
        400,
        `สินค้า "${unit.product.name}" นับเป็นจำนวน ให้กรอกยอดนับแทนการยิง serial`
      )
    }
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
            trackingType: unit.product.trackingType,
            unitLabel: unit.product.unitLabel,
          }
        : null,
      unitId: unit?.id ?? null,
      scanLogId: log.id,
    } satisfies ScanOutcome
  })
}

/**
 * กรอกยอดนับของสินค้านับจำนวนในรอบตรวจนับ - นับซ้ำได้ ยึดครั้งล่าสุด
 * ยอดนับ 0 ได้ (ของหมดพอดี) แต่ต้องเป็นจำนวนเต็มไม่ติดลบ
 */
export async function auditQuantityCount(input: {
  sessionId: string
  productId: string
  rawCounted: unknown
  userId: string
}): Promise<QuantityAuditLine> {
  const session = await prisma.auditSession.findUnique({ where: { id: input.sessionId } })
  if (!session) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')
  if (session.status !== 'OPEN') throw new HttpError(409, 'รอบตรวจนับนี้ปิดไปแล้ว')

  const counted = input.rawCounted
  const countedQty =
    typeof counted === 'string' && counted.trim() !== '' ? Number(counted) : counted
  if (typeof countedQty !== 'number' || !Number.isInteger(countedQty) || countedQty < 0) {
    throw new HttpError(400, 'ยอดนับต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป')
  }
  if (countedQty > QUANTITY_MAX) {
    throw new HttpError(400, `ยอดนับต่อครั้งไม่เกิน ${QUANTITY_MAX}`)
  }

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { category: true },
  })
  if (!product) throw new HttpError(400, 'ไม่พบสินค้าที่เลือกไว้')
  if (product.trackingType !== 'QUANTITY') {
    throw new HttpError(400, `สินค้า "${product.name}" นับเป็นรายชิ้น ให้ยิง serial แทนการกรอกยอด`)
  }
  if (session.categoryId && product.categoryId !== session.categoryId) {
    throw new HttpError(400, 'สินค้านี้อยู่นอกประเภทของที่กำลังนับรอบนี้')
  }

  const at = new Date()
  await prisma.$transaction(async (tx) => {
    await lockProduct(tx, product.id)
    await tx.scanLog.create({
      data: {
        serial: null,
        quantity: countedQty,
        type: 'AUDIT',
        result: 'OK',
        accepted: true,
        message: `นับได้ ${countedQty} ${product.unitLabel ?? 'ชิ้น'} (ระบบมี ${product.stockQty})`,
        userId: input.userId,
        productId: product.id,
        unitId: null,
        auditSessionId: session.id,
      },
    })
  })

  return {
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    categoryName: product.category.name,
    unitLabel: product.unitLabel,
    expected: product.stockQty,
    counted: countedQty,
    countedAt: at.toISOString(),
  }
}

export type AuditUnitRow = {
  unitId: string
  serial: string
  sku: string
  productName: string
  categoryName: string
}

export type QuantityAuditLine = {
  productId: string
  sku: string
  productName: string
  categoryName: string
  unitLabel: string | null
  /** ยอดที่ระบบเชื่อว่ามีตอนเปิดดูรายงาน */
  expected: number
  /** ยอดที่นับได้จริง (รอบที่ยังไม่ได้นับ = null) */
  counted: number | null
  countedAt: string | null
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
  /** สินค้านับจำนวนในขอบเขตรอบนี้ - กรอกยอดนับเทียบกับยอดระบบ */
  quantityLines: QuantityAuditLine[]
}

/** คำนวณผลรอบตรวจนับ (รอบที่ปิดแล้วจะคืน snapshot ที่เก็บไว้) */
export async function buildAuditReport(sessionId: string): Promise<AuditReport> {
  const session = await prisma.auditSession.findUnique({
    where: { id: sessionId },
    include: { category: true },
  })
  if (!session) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')

  if (session.status === 'CLOSED' && session.report) {
    // รายงานเก่าที่ปิดก่อนมีระบบนับจำนวนจะไม่มี quantityLines - เติมค่าเริ่มต้นกัน UI พัง
    const cached = session.report as unknown as AuditReport
    return { ...cached, quantityLines: cached.quantityLines ?? [] }
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

  // ── สินค้านับจำนวนในขอบเขตรอบนี้ + ยอดนับล่าสุดของแต่ละตัว ──
  // บันทึกยอดนับเป็น ScanLog AUDIT ที่ serial=null (แยกจาก log ยิง serial ที่ quantity=1)
  const quantityProducts = await prisma.product.findMany({
    where: {
      trackingType: 'QUANTITY',
      ...(session.categoryId ? { categoryId: session.categoryId } : {}),
    },
    include: { category: true },
    orderBy: { name: 'asc' },
  })
  const quantityCountLogs =
    quantityProducts.length > 0
      ? await prisma.scanLog.findMany({
          where: {
            auditSessionId: session.id,
            type: 'AUDIT',
            accepted: true,
            serial: null,
            productId: { in: quantityProducts.map((p) => p.id) },
          },
          orderBy: { createdAt: 'desc' },
        })
      : []
  const latestCountByProduct = new Map<string, (typeof quantityCountLogs)[number]>()
  for (const log of quantityCountLogs) {
    if (log.productId && !latestCountByProduct.has(log.productId)) {
      latestCountByProduct.set(log.productId, log)
    }
  }
  const quantityLines: QuantityAuditLine[] = quantityProducts.map((p) => {
    const latest = latestCountByProduct.get(p.id)
    return {
      productId: p.id,
      sku: p.sku,
      productName: p.name,
      categoryName: p.category.name,
      unitLabel: p.unitLabel,
      expected: p.stockQty,
      counted: latest?.quantity ?? null,
      countedAt: latest?.createdAt.toISOString() ?? null,
    }
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
      serial: l.serial ?? '',
      scannedAt: l.createdAt.toISOString(),
    })),
    quantityLines,
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
      // ของนับจำนวน: ตั้งยอดตามที่นับได้จริง (log ยอดนับมีอยู่แล้วตอนกรอก ไม่ต้องเขียนซ้ำ)
      const countedLines = report.quantityLines.filter((l) => l.counted !== null)
      for (const line of countedLines) {
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQty: line.counted! },
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
  /** กรองเฉพาะของที่รับเข้ามาจากผู้จำหน่ายรายนี้ */
  vendorId?: string | null
  /** ค้นหาตามชื่อสินค้า / SKU / แบรนด์ */
  q?: string | null
  /** กรองเฉพาะสินค้าที่มี transaction ของลูกค้าคนนี้ (เบิกขาย) */
  customerId?: string | null
  /** กรองเฉพาะสินค้าที่มี transaction ในช่วงเวลานี้ */
  timePeriod?: import('./date-range').TimePeriod | null
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
    trackingType: 'SERIAL' | 'QUANTITY'
    unitLabel: string | null
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

/**
 * ยอดเบิกออกสะสมของสินค้านับจำนวน (รวม quantity ไม่ได้นับแถว)
 * สินค้าแบบ SERIAL มี quantity=1 ทุกแถวจึงใช้ยอดนี้ได้เหมือนกัน แต่รายงานเดิมนับจาก SerialUnit อยู่แล้ว
 */
async function sumOutQuantity(
  productIds: string[],
  opts: { vendorId?: string | null; customerId?: string | null } = {}
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map()
  const grouped = await prisma.scanLog.groupBy({
    by: ['productId'],
    where: {
      accepted: true,
      type: 'OUT',
      productId: { in: productIds },
      ...(opts.vendorId ? { vendorId: opts.vendorId } : {}),
      ...(opts.customerId ? { customerId: opts.customerId } : {}),
    },
    _sum: { quantity: true },
  })
  return new Map(grouped.map((g) => [g.productId!, g._sum.quantity ?? 0]))
}

export async function buildStockReport(filters: StockReportFilters = {}): Promise<{
  categories: StockReportRow[]
  grandTotalInStock: number
}> {
  const where = productFilter(filters)
  const vendorId = filters.vendorId || null

  // ── หา productIds ที่ผ่าน timePeriod filter ──
  // นับทั้งสินค้าที่มี movement ใน period (ScanLog) และสินค้าที่รับเข้าใน period (SerialUnit.receivedAt)
  let timePeriodProductIds: Set<string> | null = null
  if (filters.timePeriod && filters.timePeriod !== 'all') {
    const { timePeriodRange } = await import('./date-range')
    const range = timePeriodRange(filters.timePeriod)
    if (range) {
      const [scanLogGrouped, receivedGrouped] = await Promise.all([
        prisma.scanLog.groupBy({
          by: ['productId'],
          where: {
            accepted: true,
            createdAt: { gte: range.from, lte: range.to },
            productId: { not: null },
          },
        }),
        prisma.serialUnit.groupBy({
          by: ['productId'],
          where: {
            receivedAt: { gte: range.from, lte: range.to },
          },
        }),
      ])
      timePeriodProductIds = new Set([
        ...scanLogGrouped.map((g) => g.productId!),
        ...receivedGrouped.map((g) => g.productId),
      ])
      if (timePeriodProductIds.size === 0) {
        return { categories: [], grandTotalInStock: 0 }
      }
    }
  }

  // ── หา productIds ที่ผ่าน customerId filter ──
  let customerProductIds: Set<string> | null = null
  if (filters.customerId) {
    const grouped = await prisma.scanLog.groupBy({
      by: ['productId'],
      where: {
        accepted: true,
        type: 'OUT',
        customerId: filters.customerId,
        productId: { not: null },
      },
    })
    customerProductIds = new Set(grouped.map((g) => g.productId!))
    if (customerProductIds.size === 0) {
      return { categories: [], grandTotalInStock: 0 }
    }
  }

  // ── รวม productId constraints เข้ากับ product filter ──
  const additionalAnd: Prisma.ProductWhereInput[] = []
  if (timePeriodProductIds) {
    additionalAnd.push({ id: { in: [...timePeriodProductIds] } })
  }
  if (customerProductIds) {
    additionalAnd.push({ id: { in: [...customerProductIds] } })
  }
  const finalWhere: Prisma.ProductWhereInput | undefined = additionalAnd.length > 0
    ? { AND: [where, ...additionalAnd].filter(Boolean) as Prisma.ProductWhereInput[] }
    : where

  // ── หา serials ที่ตรงกับ customerId filter ──
  let customerSerials: Set<string> | null = null
  if (filters.customerId) {
    const matched = await prisma.scanLog.findMany({
      where: { accepted: true, type: 'OUT', customerId: filters.customerId },
      select: { serial: true },
      distinct: ['serial'],
    })
    customerSerials = new Set(
      matched.map((l) => l.serial).filter((s): s is string => !!s)
    )
  }

  const unitWhere: Prisma.SerialUnitWhereInput = {
    ...(vendorId ? { vendorId } : {}),
    ...(customerSerials ? { serial: { in: [...customerSerials] } } : {}),
  }
  const hasUnitFilter = vendorId || customerSerials

  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: {
      products: {
        where: finalWhere,
        orderBy: { name: 'asc' },
        include: {
          units: hasUnitFilter
            ? { where: unitWhere, select: { status: true } }
            : { select: { status: true } },
        },
      },
    },
  })

  // ── ยอดเบิกออกสะสมของสินค้านับจำนวน (กรอง vendor/customer ตามตัวกรองที่เลือก) ──
  const quantityIds = categories.flatMap((c) =>
    c.products.filter((p) => p.trackingType === 'QUANTITY').map((p) => p.id)
  )
  const outQty = await sumOutQuantity(quantityIds, {
    vendorId,
    customerId: filters.customerId,
  })

  const rows: StockReportRow[] = categories.map((c) => {
    const products = c.products.map((p) => {
      if (p.trackingType === 'QUANTITY') {
        const out = outQty.get(p.id) ?? 0
        // กรองตามลูกค้า = ดูว่าเคยขายอะไรให้ลูกค้ารายนี้บ้าง ยอดคงเหลือไม่เกี่ยว
        const inStock = customerSerials ? 0 : p.stockQty
        return {
          productId: p.id,
          sku: p.sku,
          name: p.name,
          brand: p.brand,
          trackingType: 'QUANTITY' as const,
          unitLabel: p.unitLabel,
          inStock,
          out,
        }
      }
      const inStock = p.units.filter((u) => u.status === 'IN_STOCK').length
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        trackingType: 'SERIAL' as const,
        unitLabel: null,
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
  const hasFilter = vendorId || customerSerials
  const filtered = hasFilter
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
  const visible = filtered.filter((r) => r.products.length > 0)

  return {
    categories: visible,
    grandTotalInStock: visible.reduce((sum, r) => sum + r.totalInStock, 0),
  }
}

// ─────────────────────── รายงานสินค้าเบิกออก (สำหรับ Tab เบิกออกแล้ว) ───────────────────────

export type OutReportRow = {
  categoryId: string
  categoryCode: string
  categoryName: string
  products: {
    productId: string
    sku: string
    name: string
    brand: string | null
    trackingType: 'SERIAL' | 'QUANTITY'
    unitLabel: string | null
    out: number
  }[]
  totalOut: number
}

export async function buildOutReport(filters: StockReportFilters = {}): Promise<{
  categories: OutReportRow[]
  grandTotalOut: number
}> {
  const where = productFilter(filters)
  const vendorId = filters.vendorId || null

  // ── หา productIds ที่ผ่าน timePeriod filter ──
  let timePeriodProductIds: Set<string> | null = null
  if (filters.timePeriod && filters.timePeriod !== 'all') {
    const { timePeriodRange } = await import('./date-range')
    const range = timePeriodRange(filters.timePeriod)
    if (range) {
      const [scanLogGrouped, receivedGrouped] = await Promise.all([
        prisma.scanLog.groupBy({
          by: ['productId'],
          where: {
            accepted: true,
            createdAt: { gte: range.from, lte: range.to },
            productId: { not: null },
          },
        }),
        prisma.serialUnit.groupBy({
          by: ['productId'],
          where: {
            receivedAt: { gte: range.from, lte: range.to },
          },
        }),
      ])
      timePeriodProductIds = new Set([
        ...scanLogGrouped.map((g) => g.productId!),
        ...receivedGrouped.map((g) => g.productId),
      ])
      if (timePeriodProductIds.size === 0) {
        return { categories: [], grandTotalOut: 0 }
      }
    }
  }

  // ── หา productIds ที่ผ่าน customerId filter ──
  let customerProductIds: Set<string> | null = null
  if (filters.customerId) {
    const grouped = await prisma.scanLog.groupBy({
      by: ['productId'],
      where: {
        accepted: true,
        type: 'OUT',
        customerId: filters.customerId,
        productId: { not: null },
      },
    })
    customerProductIds = new Set(grouped.map((g) => g.productId!))
    if (customerProductIds.size === 0) {
      return { categories: [], grandTotalOut: 0 }
    }
  }

  // ── รวม productId constraints เข้ากับ product filter ──
  const additionalAnd: Prisma.ProductWhereInput[] = []
  if (timePeriodProductIds) {
    additionalAnd.push({ id: { in: [...timePeriodProductIds] } })
  }
  if (customerProductIds) {
    additionalAnd.push({ id: { in: [...customerProductIds] } })
  }
  const finalWhere: Prisma.ProductWhereInput | undefined = additionalAnd.length > 0
    ? { AND: [where, ...additionalAnd].filter(Boolean) as Prisma.ProductWhereInput[] }
    : where

  // ── หา serials ที่ตรงกับ customerId filter ──
  let customerSerials: Set<string> | null = null
  if (filters.customerId) {
    const matched = await prisma.scanLog.findMany({
      where: { accepted: true, type: 'OUT', customerId: filters.customerId },
      select: { serial: true },
      distinct: ['serial'],
    })
    customerSerials = new Set(
      matched.map((l) => l.serial).filter((s): s is string => !!s)
    )
  }

  // ── ดึงเฉพาะ serial ที่เบิกออกแล้ว ──
  const unitWhere: Prisma.SerialUnitWhereInput = {
    status: 'OUT',
    ...(vendorId ? { vendorId } : {}),
    ...(customerSerials ? { serial: { in: [...customerSerials] } } : {}),
  }

  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: {
      products: {
        where: finalWhere,
        orderBy: { name: 'asc' },
        include: {
          units: { where: unitWhere, select: { status: true } },
        },
      },
    },
  })

  // ── ยอดเบิกออกสะสมของสินค้านับจำนวน (รวม quantity) ──
  const outQuantityIds = categories.flatMap((c) =>
    c.products.filter((p) => p.trackingType === 'QUANTITY').map((p) => p.id)
  )
  const outQtySums = await sumOutQuantity(outQuantityIds, {
    vendorId,
    customerId: filters.customerId,
  })

  const rows: OutReportRow[] = categories.map((c) => {
    const products = c.products
      .map((p) => {
        if (p.trackingType === 'QUANTITY') {
          return {
            productId: p.id,
            sku: p.sku,
            name: p.name,
            brand: p.brand,
            trackingType: 'QUANTITY' as const,
            unitLabel: p.unitLabel,
            out: outQtySums.get(p.id) ?? 0,
          }
        }
        return {
          productId: p.id,
          sku: p.sku,
          name: p.name,
          brand: p.brand,
          trackingType: 'SERIAL' as const,
          unitLabel: null,
          out: p.units.length,
        }
      })
      .filter((p) => p.out > 0)
    return {
      categoryId: c.id,
      categoryCode: c.code,
      categoryName: c.name,
      products,
      totalOut: products.reduce((sum, p) => sum + p.out, 0),
    }
  })

  const hasFilter = vendorId || customerSerials
  const filtered = hasFilter
    ? rows
        .map((r) => {
          const products = r.products.filter((p) => p.out > 0)
          return { ...r, products, totalOut: products.reduce((sum, p) => sum + p.out, 0) }
        })
        .filter((r) => r.products.length > 0)
    : rows
  const visible = filtered.filter((r) => r.products.length > 0)

  return {
    categories: visible,
    grandTotalOut: visible.reduce((sum, r) => sum + r.totalOut, 0),
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

/** ผู้จำหน่ายที่ยังเปิดใช้งาน + เจ้าที่ปิดไปแล้วแต่ยังมีของค้างอยู่ - ใช้เติม dropdown ตัวกรอง */
export async function listVendors(): Promise<{ id: string; code: string; name: string }[]> {
  return prisma.vendor.findMany({
    where: { OR: [{ active: true }, { units: { some: {} } }] },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true },
  })
}

/** ลูกค้าที่ยังเปิดใช้งาน - ใช้เติม dropdown ตัวกรองผู้ซื้อ */
export async function listCustomers(): Promise<{ id: string; code: string; name: string }[]> {
  return prisma.customer.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true },
  })
}

// ─────────────────────── รายงานคงเหลือแบบละเอียด (สำหรับ Export) ───────────────────────

export type SerialWithHistory = {
  serial: string
  status: UnitStatusCode
  receivedAt: string | null
  releasedAt: string | null
  vendorName: string | null
  history: SerialHistoryEntry[]
}

export type StockReportDetailedProduct = {
  productId: string
  sku: string
  name: string
  brand: string | null
  trackingType: 'SERIAL' | 'QUANTITY'
  unitLabel: string | null
  inStock: number
  out: number
  serials: SerialWithHistory[]
}

export type StockReportDetailedRow = {
  categoryId: string
  categoryCode: string
  categoryName: string
  products: StockReportDetailedProduct[]
  totalInStock: number
}

export type StockReportDetailed = {
  categories: StockReportDetailedRow[]
  grandTotalInStock: number
}

/**
 * รายงานคงเหลือแบบละเอียด - ใช้สำหรับ Export Excel/PDF ที่ต้องการแสดง Serial + ประวัติ
 * ใช้ filter logic เดียวกับ buildStockReport() ทุกประการ
 * รองรับ timePeriod (กรองสินค้าที่มี transaction ในช่วงเวลา) และ customerId (กรองลูกค้าที่เบิกขาย)
 */
export async function buildStockReportDetailed(filters: StockReportFilters = {}): Promise<StockReportDetailed> {
  const where = productFilter(filters)
  const vendorId = filters.vendorId || null

  // ── หา productIds ที่ผ่าน timePeriod filter ──
  // นับทั้งสินค้าที่มี movement ใน period (ScanLog) และสินค้าที่รับเข้าใน period (SerialUnit.receivedAt)
  let timePeriodProductIds: Set<string> | null = null
  if (filters.timePeriod && filters.timePeriod !== 'all') {
    const { timePeriodRange } = await import('./date-range')
    const range = timePeriodRange(filters.timePeriod)
    if (range) {
      const [scanLogGrouped, receivedGrouped] = await Promise.all([
        prisma.scanLog.groupBy({
          by: ['productId'],
          where: {
            accepted: true,
            createdAt: { gte: range.from, lte: range.to },
            productId: { not: null },
          },
        }),
        prisma.serialUnit.groupBy({
          by: ['productId'],
          where: {
            receivedAt: { gte: range.from, lte: range.to },
          },
        }),
      ])
      timePeriodProductIds = new Set([
        ...scanLogGrouped.map((g) => g.productId!),
        ...receivedGrouped.map((g) => g.productId),
      ])
      if (timePeriodProductIds.size === 0) {
        return { categories: [], grandTotalInStock: 0 }
      }
    }
  }

  // ── หา productIds ที่ผ่าน customerId filter ──
  let customerProductIds: Set<string> | null = null
  if (filters.customerId) {
    const grouped = await prisma.scanLog.groupBy({
      by: ['productId'],
      where: {
        accepted: true,
        type: 'OUT',
        customerId: filters.customerId,
        productId: { not: null },
      },
    })
    customerProductIds = new Set(grouped.map((g) => g.productId!))
    if (customerProductIds.size === 0) {
      return { categories: [], grandTotalInStock: 0 }
    }
  }

  // ── รวม productId constraints เข้ากับ product filter ──
  const additionalAnd: Prisma.ProductWhereInput[] = []
  if (timePeriodProductIds) {
    additionalAnd.push({ id: { in: [...timePeriodProductIds] } })
  }
  if (customerProductIds) {
    additionalAnd.push({ id: { in: [...customerProductIds] } })
  }
  const finalWhere: Prisma.ProductWhereInput | undefined = additionalAnd.length > 0
    ? { AND: [where, ...additionalAnd].filter(Boolean) as Prisma.ProductWhereInput[] }
    : where

  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: {
      products: {
        where: finalWhere,
        orderBy: { name: 'asc' },
        include: {
          units: {
            where: vendorId ? { vendorId } : undefined,
            include: {
              vendor: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  // ── ดึง ScanLog ทั้งหมดของ serial ที่เกี่ยวข้อง ──
  // ถ้ามี timePeriod filter ต้อง limit scanLog ด้วยช่วงเวลาด้วย
  const allUnitSerials = categories.flatMap((c) =>
    c.products.flatMap((p) => p.units.map((u) => u.serial))
  )

  const { timePeriodRange } = await import('./date-range')
  const timeRange = (filters.timePeriod && filters.timePeriod !== 'all')
    ? timePeriodRange(filters.timePeriod)
    : null

  const allLogs = allUnitSerials.length > 0
    ? await prisma.scanLog.findMany({
        where: {
          serial: { in: allUnitSerials },
          ...(timeRange ? { createdAt: { gte: timeRange.from, lte: timeRange.to } } : {}),
          ...(filters.customerId ? { customerId: filters.customerId } : {}),
        },
        orderBy: { createdAt: 'asc' },
        include: scanLogInclude,
      })
    : []

  // จัดกลุ่ม log ตาม serial
  const logsBySerial = new Map<string, ScanLogWithRelations[]>()
  for (const log of allLogs) {
    if (!log.serial) continue // รายการของสินค้านับจำนวนไม่มี serial
    const list = logsBySerial.get(log.serial) ?? []
    list.push(log)
    logsBySerial.set(log.serial, list)
  }

  // ── หา serials ที่ผ่าน customerId filter (ถ้ามี) ──
  let customerSerials: Set<string> | null = null
  if (filters.customerId && allUnitSerials.length > 0) {
    const matched = await prisma.scanLog.findMany({
      where: {
        serial: { in: allUnitSerials },
        accepted: true,
        type: 'OUT',
        customerId: filters.customerId,
      },
      select: { serial: true },
    })
    customerSerials = new Set(
      matched.map((l) => l.serial).filter((s): s is string => !!s)
    )
  }

  // ── ยอดเบิกออกสะสมของสินค้านับจำนวน (สินค้าแบบนี้ไม่มี serials ให้โชว์) ──
  const detailedQtyIds = categories.flatMap((c) =>
    c.products.filter((p) => p.trackingType === 'QUANTITY').map((p) => p.id)
  )
  const detailedOutQty = await sumOutQuantity(detailedQtyIds, {
    vendorId,
    customerId: filters.customerId,
  })

  const rows: StockReportDetailedRow[] = categories.map((c) => {
    const products: StockReportDetailedProduct[] = c.products.map((p) => {
      if (p.trackingType === 'QUANTITY') {
        const out = detailedOutQty.get(p.id) ?? 0
        const inStock = customerSerials ? 0 : p.stockQty
        return {
          productId: p.id,
          sku: p.sku,
          name: p.name,
          brand: p.brand,
          trackingType: 'QUANTITY' as const,
          unitLabel: p.unitLabel,
          inStock,
          out,
          serials: [],
        }
      }
      // ถ้ามี customerId filter ให้ count เฉพาะ serial ที่เกี่ยวข้องกับลูกค้า
      const countedUnits = customerSerials
        ? p.units.filter((u) => customerSerials!.has(u.serial))
        : p.units
      const inStock = countedUnits.filter((u) => u.status === 'IN_STOCK').length
      // ถ้ามี customerId filter ให้แสดงเฉพาะ serial ที่เคยเบิกให้ลูกค้ารายนี้
      // แสดงเฉพาะ serial ที่ยังอยู่ในคลัง (IN_STOCK)
      const unitsToShow = customerSerials
        ? p.units.filter((u) => customerSerials!.has(u.serial) && u.status === 'IN_STOCK')
        : p.units.filter((u) => u.status === 'IN_STOCK')
      const serials: SerialWithHistory[] = unitsToShow.map((u) => ({
        serial: u.serial,
        status: u.status,
        receivedAt: u.receivedAt?.toISOString() ?? null,
        releasedAt: u.releasedAt?.toISOString() ?? null,
        vendorName: u.vendor?.name ?? null,
        history: (logsBySerial.get(u.serial) ?? []).map(toHistoryEntry),
      }))
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        trackingType: 'SERIAL' as const,
        unitLabel: null,
        inStock,
        out: countedUnits.length - inStock,
        serials,
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

  const hasFilter = vendorId || customerSerials
  const filtered = hasFilter
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
  const visible = filtered.filter((r) => r.products.length > 0)

  return {
    categories: visible,
    grandTotalInStock: visible.reduce((sum, r) => sum + r.totalInStock, 0),
  }
}

// ─────────────────────── รายงานสินค้าเบิกออกแบบละเอียด (สำหรับ Export) ───────────────────────

export type OutReportDetailedProduct = {
  productId: string
  sku: string
  name: string
  brand: string | null
  trackingType: 'SERIAL' | 'QUANTITY'
  unitLabel: string | null
  out: number
  serials: SerialWithHistory[]
}

export type OutReportDetailedRow = {
  categoryId: string
  categoryCode: string
  categoryName: string
  products: OutReportDetailedProduct[]
  totalOut: number
}

export type OutReportDetailed = {
  categories: OutReportDetailedRow[]
  grandTotalOut: number
}

/**
 * รายงานสินค้าเบิกออกแบบละเอียด - ใช้สำหรับ Export Excel/PDF
 * แสดงเฉพาะ Serial ที่มีสถานะเบิกออกแล้ว (OUT)
 */
export async function buildOutReportDetailed(filters: StockReportFilters = {}): Promise<OutReportDetailed> {
  const where = productFilter(filters)
  const vendorId = filters.vendorId || null

  // ── หา productIds ที่ผ่าน timePeriod filter ──
  let timePeriodProductIds: Set<string> | null = null
  if (filters.timePeriod && filters.timePeriod !== 'all') {
    const { timePeriodRange } = await import('./date-range')
    const range = timePeriodRange(filters.timePeriod)
    if (range) {
      const [scanLogGrouped, receivedGrouped] = await Promise.all([
        prisma.scanLog.groupBy({
          by: ['productId'],
          where: {
            accepted: true,
            createdAt: { gte: range.from, lte: range.to },
            productId: { not: null },
          },
        }),
        prisma.serialUnit.groupBy({
          by: ['productId'],
          where: {
            receivedAt: { gte: range.from, lte: range.to },
          },
        }),
      ])
      timePeriodProductIds = new Set([
        ...scanLogGrouped.map((g) => g.productId!),
        ...receivedGrouped.map((g) => g.productId),
      ])
      if (timePeriodProductIds.size === 0) {
        return { categories: [], grandTotalOut: 0 }
      }
    }
  }

  // ── หา productIds ที่ผ่าน customerId filter ──
  let customerProductIds: Set<string> | null = null
  if (filters.customerId) {
    const grouped = await prisma.scanLog.groupBy({
      by: ['productId'],
      where: {
        accepted: true,
        type: 'OUT',
        customerId: filters.customerId,
        productId: { not: null },
      },
    })
    customerProductIds = new Set(grouped.map((g) => g.productId!))
    if (customerProductIds.size === 0) {
      return { categories: [], grandTotalOut: 0 }
    }
  }

  // ── รวม productId constraints ──
  const additionalAnd: Prisma.ProductWhereInput[] = []
  if (timePeriodProductIds) additionalAnd.push({ id: { in: [...timePeriodProductIds] } })
  if (customerProductIds) additionalAnd.push({ id: { in: [...customerProductIds] } })
  const finalWhere: Prisma.ProductWhereInput | undefined = additionalAnd.length > 0
    ? { AND: [where, ...additionalAnd].filter(Boolean) as Prisma.ProductWhereInput[] }
    : where

  // ── หา serials ที่ตรงกับ customerId filter ──
  let customerSerials: Set<string> | null = null
  if (filters.customerId) {
    const matched = await prisma.scanLog.findMany({
      where: { accepted: true, type: 'OUT', customerId: filters.customerId },
      select: { serial: true },
      distinct: ['serial'],
    })
    customerSerials = new Set(
      matched.map((l) => l.serial).filter((s): s is string => !!s)
    )
  }

  // ── ดึงเฉพาะ serial ที่เบิกออกแล้ว ──
  const unitWhere: Prisma.SerialUnitWhereInput = {
    status: 'OUT',
    ...(vendorId ? { vendorId } : {}),
    ...(customerSerials ? { serial: { in: [...customerSerials] } } : {}),
  }

  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: {
      products: {
        where: finalWhere,
        orderBy: { name: 'asc' },
        include: {
          units: {
            where: unitWhere,
            include: { vendor: { select: { name: true } } },
          },
        },
      },
    },
  })

  // ── ดึง ScanLog ทั้งหมดของ serial ที่เกี่ยวข้อง ──
  const allUnitSerials = categories.flatMap((c) =>
    c.products.flatMap((p) => p.units.map((u) => u.serial))
  )

  const { timePeriodRange } = await import('./date-range')
  const timeRange = (filters.timePeriod && filters.timePeriod !== 'all')
    ? timePeriodRange(filters.timePeriod)
    : null

  const allLogs = allUnitSerials.length > 0
    ? await prisma.scanLog.findMany({
        where: {
          serial: { in: allUnitSerials },
          accepted: true,
          ...(timeRange ? { createdAt: { gte: timeRange.from, lte: timeRange.to } } : {}),
          ...(filters.customerId ? { customerId: filters.customerId } : {}),
        },
        orderBy: { createdAt: 'asc' },
        include: scanLogInclude,
      })
    : []

  const logsBySerial = new Map<string, ScanLogWithRelations[]>()
  for (const log of allLogs) {
    if (!log.serial) continue // รายการของสินค้านับจำนวนไม่มี serial
    const list = logsBySerial.get(log.serial) ?? []
    list.push(log)
    logsBySerial.set(log.serial, list)
  }

  // ── ยอดเบิกออกสะสมของสินค้านับจำนวน (รวม quantity) ──
  const outDetailedQtyIds = categories.flatMap((c) =>
    c.products.filter((p) => p.trackingType === 'QUANTITY').map((p) => p.id)
  )
  const outDetailedQtySums = await sumOutQuantity(outDetailedQtyIds, {
    vendorId,
    customerId: filters.customerId,
  })

  const rows: OutReportDetailedRow[] = categories
    .filter((c) => c.products.length > 0)
    .map((c) => {
      const products: OutReportDetailedProduct[] = c.products
        .map((p) => {
          if (p.trackingType === 'QUANTITY') {
            return {
              productId: p.id,
              sku: p.sku,
              name: p.name,
              brand: p.brand,
              trackingType: 'QUANTITY' as const,
              unitLabel: p.unitLabel,
              out: outDetailedQtySums.get(p.id) ?? 0,
              serials: [],
            }
          }
          return {
            productId: p.id,
            sku: p.sku,
            name: p.name,
            brand: p.brand,
            trackingType: 'SERIAL' as const,
            unitLabel: null,
            out: p.units.length,
            serials: p.units.map((u) => ({
              serial: u.serial,
              status: u.status,
              receivedAt: u.receivedAt?.toISOString() ?? null,
              releasedAt: u.releasedAt?.toISOString() ?? null,
              vendorName: u.vendor?.name ?? null,
              history: (logsBySerial.get(u.serial) ?? []).map(toHistoryEntry),
            })),
          }
        })
        .filter((p) => p.out > 0)
    return {
      categoryId: c.id,
      categoryCode: c.code,
      categoryName: c.name,
      products,
      totalOut: products.reduce((sum, p) => sum + p.out, 0),
    }
  })

  return {
    categories: rows,
    grandTotalOut: rows.reduce((sum, r) => sum + r.totalOut, 0),
  }
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
  customerName: string | null
  auditSessionName: string | null
  at: string
}

const scanLogInclude = {
  user: { select: { displayName: true } },
  product: { select: { name: true } },
  vendor: { select: { name: true } },
  customer: { select: { code: true, name: true } },
  auditSession: { select: { name: true } },
} satisfies Prisma.ScanLogInclude

const scanLogDetailInclude = {
  user: { select: { displayName: true } },
  product: { select: { name: true, sku: true, brand: true, category: { select: { name: true } } } },
  vendor: { select: { name: true } },
  customer: { select: { code: true, name: true } },
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
    customerName: log.customer ? `${log.customer.code} · ${log.customer.name}` : null,
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
  rows: (SerialHistoryEntry & { serial: string | null; quantity: number })[]
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
    rows: logs.map((l) => ({ ...toHistoryEntry(l), serial: l.serial, quantity: l.quantity })),
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
    _sum: { quantity: true },
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
        inCount: forProduct.find((g) => g.type === 'IN')?._sum.quantity ?? 0,
        outCount: forProduct.find((g) => g.type === 'OUT')?._sum.quantity ?? 0,
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

// ─────────────────────── รายงานความเคลื่อนไหวแบบละเอียด (สำหรับ Export) ───────────────────────

export type MovementDetailRow = {
  id: string
  at: string
  /** serial ที่ยิง - รายการของสินค้านับจำนวนไม่มี serial (null) ให้ดู quantity แทน */
  serial: string | null
  quantity: number
  type: 'IN' | 'OUT' | 'AUDIT'
  result: string
  message: string | null
  reason: OutReasonCode | null
  note: string | null
  sku: string
  productName: string
  brand: string | null
  categoryName: string
  userName: string
  customerName: string | null
}

export type MovementDetailReport = {
  from: string
  to: string
  rows: MovementDetailRow[]
  totalIn: number
  totalOut: number
}

/**
 * รายงานความเคลื่อนไหวแบบละเอียด - แสดง Transaction History ทั้งหมด
 * ใช้สำหรับ Tab ความเคลื่อนไหว และ Export
 * ไม่ใช้ timePeriod filter (movement ไม่มี timePeriod)
 */
export async function buildMovementDetail(
  input: StockReportFilters & { from: Date; to: Date }
): Promise<MovementDetailReport> {
  if (input.from > input.to) throw new HttpError(400, 'วันเริ่มต้นต้องไม่เกินวันสิ้นสุด')

  const product = productFilter(input)
  const where: Prisma.ScanLogWhereInput = {
    accepted: true,
    createdAt: { gte: input.from, lte: input.to },
    ...(input.vendorId ? { vendorId: input.vendorId } : {}),
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(product ? { product } : {}),
  }

  const logs = await prisma.scanLog.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: scanLogDetailInclude,
  })

  const rows: MovementDetailRow[] = logs.map((l) => ({
    id: l.id,
    at: l.createdAt.toISOString(),
    serial: l.serial,
    quantity: l.quantity,
    type: l.type as 'IN' | 'OUT' | 'AUDIT',
    result: l.result,
    message: l.message,
    reason: l.reason as OutReasonCode | null,
    note: l.note,
    sku: (l.product as { sku: string } | null)?.sku ?? '-',
    productName: (l.product as { name: string } | null)?.name ?? '-',
    brand: (l.product as { brand: string | null } | null)?.brand ?? null,
    categoryName: (l.product as { category?: { name: string } } | null)?.category?.name ?? '-',
    userName: l.user.displayName,
    customerName: l.customer ? `${l.customer.code} · ${l.customer.name}` : null,
  }))

  const totalIn = rows.filter((r) => r.type === 'IN').reduce((sum, r) => sum + r.quantity, 0)
  const totalOut = rows.filter((r) => r.type === 'OUT').reduce((sum, r) => sum + r.quantity, 0)

  return {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    rows,
    totalIn,
    totalOut,
  }
}
