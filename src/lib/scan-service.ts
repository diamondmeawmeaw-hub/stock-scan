import { Prisma } from '@prisma/client'
import { HttpError } from './auth'
import { prisma } from './prisma'
import {
  QUANTITY_MAX,
  decideAuditScan,
  decideScanIn,
  decideScanOut,
  isUnitInScope,
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
  projectId?: string | null
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
  const projectId = await resolveProject(
    input.reason === 'SALE' ? input.projectId : null,
    input.customerId ?? null
  )

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

    // เบิกซ้ำ -> บอกไปด้วยว่าเบิกไปเมื่อไหร่ ให้ใคร จะได้ตามของถูก
    let message = decision.message
    if (decision.result === 'ALREADY_OUT') {
      const lastOut = await tx.scanLog.findFirst({
        where: { serial, type: 'OUT', accepted: true, result: 'OK' },
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { displayName: true } },
          customer: { select: { code: true, name: true } },
        },
      })
      if (lastOut) {
        const when = lastOut.createdAt.toLocaleString('th-TH', {
          timeZone: 'Asia/Bangkok',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
        const who = lastOut.customer
          ? `${lastOut.customer.code} · ${lastOut.customer.name}`
          : lastOut.user.displayName
        message = `ของชิ้นนี้ถูกเบิกออกไปแล้ว (เบิกไปเมื่อ ${when} ให้ ${who})`
      }
    }

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
        message,
        reason: input.reason,
        note: input.note ?? null,
        userId: input.userId,
        productId: unit?.productId ?? null,
        unitId: unit?.id ?? null,
        customerId: input.reason === 'SALE' ? input.customerId ?? null : null,
        projectId,
      },
    })

    return {
      accepted: decision.accepted,
      result: decision.result,
      message,
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

/**
 * ตรวจโปรเจคที่จะผูกกับรายการขาย - ต้องเป็นของลูกค้าคนเดียวกับที่เลือกไว้ และยังเปิดอยู่
 *
 * ปิดโปรเจคแล้วของเดิมที่เคยขายไปยังอยู่ครบให้ดูย้อนหลังได้
 * แต่รับของใหม่เข้าโปรเจคที่ปิดไปแล้วไม่ได้ กันของไหลไปลงงานที่จบแล้ว
 */
async function resolveProject(
  projectId: string | null | undefined,
  customerId: string | null
): Promise<string | null> {
  const id = projectId ?? null
  if (!id) return null
  if (!customerId) throw new HttpError(400, 'ต้องเลือกลูกค้าก่อนจึงจะผูกโปรเจคได้')
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) throw new HttpError(400, 'ไม่พบโปรเจคที่เลือกไว้')
  if (project.customerId !== customerId) throw new HttpError(400, 'โปรเจคนี้ไม่ได้เป็นของลูกค้าที่เลือก')
  if (!project.active) throw new HttpError(400, `โปรเจค "${project.name}" ถูกปิดใช้งานอยู่`)
  return project.id
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
  projectId?: string | null
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
  const projectId = await resolveProject(
    input.reason === 'SALE' ? input.projectId : null,
    customerId
  )

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
        projectId,
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

// ────────────────────────────── คืนของที่เบิกผิด ──────────────────────────────

/**
 * คืนของที่เบิกออกไปแล้วกลับเข้าคลัง (ยิงเบิกผิดตัว เบิกเกิน ฯลฯ)
 *
 * ผูก log คืนกับ log เบิกเดิม (reversesId) - 1 รายการเบิกคืนได้ครั้งเดียว กันกดคืนซ้ำ
 * ต่างจากการยิงรับเข้าคืนเองตรงที่ประวัติโยงกัน ดูย้อนได้ว่า "ออกผิดแล้วคืน"
 */
export async function returnOut(input: {
  scanLogId: string
  userId: string
  note?: string | null
}): Promise<ScanOutcome> {
  const original = await prisma.scanLog.findUnique({
    where: { id: input.scanLogId },
    include: {
      product: { include: { category: true } },
      reversedBy: { select: { id: true } },
    },
  })
  if (!original) throw new HttpError(404, 'ไม่พบบันทึกการเบิกนี้')
  if (original.type !== 'OUT' || !original.accepted || original.result !== 'OK') {
    throw new HttpError(400, 'คืนได้เฉพาะรายการเบิกออกที่สำเร็จเท่านั้น')
  }
  if (original.reversedBy) throw new HttpError(409, 'รายการนี้ถูกคืนเข้าคลังไปแล้ว')
  if (!original.product) throw new HttpError(400, 'รายการนี้ไม่ผูกกับสินค้า คืนไม่ได้')

  const product = original.product
  const qty = original.quantity
  const now = new Date()

  // กันกดคืนพร้อมกันสองเครื่อง - เช็กซ้ำใน transaction ว่ารอยคืนนี้ยังว่างอยู่
  async function assertNotReturned(tx: Prisma.TransactionClient): Promise<void> {
    const dup = await tx.scanLog.findUnique({
      where: { reversesId: original!.id },
      select: { id: true },
    })
    if (dup) throw new HttpError(409, 'รายการนี้ถูกคืนเข้าคลังไปแล้ว')
  }

  if (product.trackingType === 'QUANTITY') {
    const outcome = await prisma.$transaction(async (tx) => {
      await lockProduct(tx, product.id)
      await assertNotReturned(tx)
      const updated = await tx.product.update({
        where: { id: product.id },
        data: { stockQty: { increment: qty } },
        select: { stockQty: true },
      })
      const log = await tx.scanLog.create({
        data: {
          serial: null,
          quantity: qty,
          type: 'IN',
          result: 'RETURNED',
          accepted: true,
          message: `คืนของที่เบิกผิด ${qty} ${product.unitLabel ?? 'ชิ้น'}`,
          note: input.note ?? null,
          userId: input.userId,
          productId: product.id,
          unitId: null,
          reversesId: original.id,
        },
      })
      return { productInStock: updated.stockQty, scanLogId: log.id }
    })
    return {
      accepted: true,
      result: 'RETURNED',
      message: `คืน ${product.name} ${qty} ${product.unitLabel ?? 'ชิ้น'} เข้าคลังแล้ว (คงเหลือ ${outcome.productInStock})`,
      serial: product.sku,
      quantity: qty,
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        categoryName: product.category.name,
        trackingType: 'QUANTITY',
        unitLabel: product.unitLabel,
      },
      unitId: null,
      scanLogId: outcome.scanLogId,
      productInStock: outcome.productInStock,
    }
  }

  // ── สินค้ารายชิ้น ──
  const serial = original.serial
  if (!original.unitId || !serial) {
    throw new HttpError(400, 'รายการนี้ไม่มี serial ผูกอยู่ คืนไม่ได้')
  }
  const outcome = await prisma.$transaction(async (tx) => {
    await lockSerial(tx, serial)
    await assertNotReturned(tx)
    const unit = await tx.serialUnit.findUnique({ where: { id: original.unitId! } })
    if (!unit) throw new HttpError(404, 'ไม่พบของชิ้นนี้ในระบบแล้ว')
    if (unit.status !== 'OUT') throw new HttpError(409, 'ของชิ้นนี้กลับเข้าคลังไปแล้ว')
    await tx.serialUnit.update({
      where: { id: unit.id },
      data: { status: 'IN_STOCK', receivedAt: now, releasedAt: null, lastScanAt: now },
    })
    const log = await tx.scanLog.create({
      data: {
        serial,
        quantity: 1,
        type: 'IN',
        result: 'RETURNED',
        accepted: true,
        message: 'คืนของที่เบิกผิดกลับเข้าคลัง',
        note: input.note ?? null,
        userId: input.userId,
        productId: unit.productId,
        unitId: unit.id,
        reversesId: original.id,
      },
    })
    return { scanLogId: log.id }
  })

  return withStockCount({
    accepted: true,
    result: 'RETURNED',
    message: `คืน ${product.name} (${serial}) กลับเข้าคลังแล้ว`,
    serial,
    quantity: 1,
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      categoryName: product.category.name,
      trackingType: 'SERIAL',
      unitLabel: product.unitLabel,
    },
    unitId: original.unitId,
    scanLogId: outcome.scanLogId,
  })
}

// ────────────────────────────── ตรวจนับสต็อก ──────────────────────────────

/**
 * เช็กว่าสินค้าอยู่ในขอบเขตรอบตรวจนับไหม - กฏเดียวใช้ทั้งรอบ
 * (ติ๊ก product ไว้ หรือ category ของมันถูกติ๊กไว้ = ผ่าน, ว่างทั้งหมด = ทั้งคลัง)
 */
export function isInScope(
  session: { categoryId: string | null; categoryIds: string[]; productIds: string[] },
  product: { id: string; categoryId: string }
): boolean {
  return isUnitInScope(
    { productId: product.id, categoryId: product.categoryId },
    {
      categoryId: session.categoryId,
      categoryIds: session.categoryIds,
      productIds: session.productIds,
    }
  )
}

/** ดึง scope ออกจาก session */
function sessionScope(session: {
  categoryId: string | null
  categoryIds: string[]
  productIds: string[]
}): { categoryId: string | null; categoryIds: string[]; productIds: string[] } {
  return {
    categoryId: session.categoryId,
    categoryIds: session.categoryIds ?? [],
    productIds: session.productIds ?? [],
  }
}

export async function openAuditSession(input: {
  name: string
  categoryId?: string | null
  categoryIds?: string[]
  productIds?: string[]
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
  const categoryIds = [...new Set(input.categoryIds ?? [])]
  const productIds = [...new Set(input.productIds ?? [])]
  if (categoryIds.length > 0) {
    const count = await prisma.category.count({ where: { id: { in: categoryIds } } })
    if (count !== categoryIds.length) throw new HttpError(400, 'มีประเภทของที่เลือกไม่อยู่ในระบบ')
  }
  if (productIds.length > 0) {
    const count = await prisma.product.count({ where: { id: { in: productIds } } })
    if (count !== productIds.length) throw new HttpError(400, 'มีสินค้าที่เลือกไม่อยู่ในระบบ')
  }
  return prisma.$transaction(async (tx) => {
    // กันสองเครื่องกด "เริ่มตรวจนับ" พร้อมกันแล้วได้รอบ OPEN สองรอบ
    // (CHECK แล้ว CREATE ต้องอยู่ใน lock เดียวกัน)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('stock-scan:audit-open'))`
    const stillOpen = await tx.auditSession.findFirst({ where: { status: 'OPEN' } })
    if (stillOpen) {
      throw new HttpError(
        409,
        `ยังมีรอบตรวจนับที่เปิดค้างอยู่ ("${stillOpen.name}") ปิดรอบเดิมก่อนจึงจะเปิดรอบใหม่ได้`
      )
    }
    return tx.auditSession.create({
      data: {
        name: input.name.trim(),
        categoryId: input.categoryId ?? null,
        categoryIds,
        productIds,
        startedById: input.userId,
        note: input.note ?? null,
      },
      include: { category: true },
    })
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
    // ล็อกแบบ share: หลายเครื่องสแกนพร้อมกันได้ แต่ close (FOR UPDATE) ต้องรอ
    // กัน log AUDIT ถูกเขียนลงรอบที่เพิ่งปิดไปแล้ว
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "AuditSession" WHERE id = ${session.id} FOR SHARE
    `
    if (locked.length === 0) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')
    const liveSession = await tx.auditSession.findUnique({ where: { id: session.id } })
    if (!liveSession) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')
    if (liveSession.status !== 'OPEN') throw new HttpError(409, 'รอบตรวจนับนี้ปิดไปแล้ว')

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
        where: { auditSessionId: liveSession.id, serial, accepted: true },
      })) > 0

    const decision = decideAuditScan(toSnapshot(unit), {
      scopeCategoryId: liveSession.categoryId,
      scopeCategoryIds: liveSession.categoryIds,
      scopeProductIds: liveSession.productIds,
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
        auditSessionId: liveSession.id,
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
  if (!isInScope(sessionScope(session), { id: product.id, categoryId: product.categoryId })) {
    throw new HttpError(400, 'สินค้านี้อยู่นอกขอบเขตที่กำลังนับรอบนี้')
  }

  return prisma.$transaction(async (tx) => {
    // ล็อกแบบ share กัน close แทรกกลางคัน (close ใช้ FOR UPDATE)
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "AuditSession" WHERE id = ${session.id} FOR SHARE
    `
    if (locked.length === 0) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')
    const liveSession = await tx.auditSession.findUnique({ where: { id: session.id } })
    if (!liveSession) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')
    if (liveSession.status !== 'OPEN') throw new HttpError(409, 'รอบตรวจนับนี้ปิดไปแล้ว')

    const fresh = await tx.product.findUnique({
      where: { id: product.id },
      include: { category: true },
    })
    if (!fresh) throw new HttpError(400, 'ไม่พบสินค้าที่เลือกไว้')
    if (!isInScope(sessionScope(liveSession), { id: fresh.id, categoryId: fresh.categoryId })) {
      throw new HttpError(400, 'สินค้านี้อยู่นอกขอบเขตที่กำลังนับรอบนี้')
    }

    // ล็อกสินค้าแล้วอ่านยอดสด - กันยอดที่แสดงใน log เก่าระหว่างมีคนรับเข้า
    await lockProduct(tx, fresh.id)
    const live = await tx.product.findUniqueOrThrow({
      where: { id: fresh.id },
      select: { stockQty: true },
    })
    const at = new Date()
    await tx.scanLog.create({
      data: {
        serial: null,
        quantity: countedQty,
        type: 'AUDIT',
        result: 'OK',
        accepted: true,
        message: `นับได้ ${countedQty} ${fresh.unitLabel ?? 'ชิ้น'} (ระบบมี ${live.stockQty})`,
        userId: input.userId,
        productId: fresh.id,
        unitId: null,
        auditSessionId: liveSession.id,
      },
    })

    return {
      productId: fresh.id,
      sku: fresh.sku,
      productName: fresh.name,
      categoryName: fresh.category.name,
      unitLabel: fresh.unitLabel,
      expected: live.stockQty,
      counted: countedQty,
      countedAt: at.toISOString(),
    }
  })
}

/**
 * ลบรอบตรวจนับที่เปิดผิด - ได้เฉพาะรอบที่ยังว่าง (ยังไม่ยิง/กรอกอะไรเลย)
 * รอบที่มี log แล้วลบไม่ได้ กันลบหลักฐาน ให้ปิดรอบแทน
 */
export async function deleteAuditSession(input: { sessionId: string }): Promise<{ ok: true }> {
  await prisma.$transaction(async (tx) => {
    // ล็อกรอบไว้ก่อนนับ log - กันสแกนใหม่แทรกแล้วถูกลบตาม cascade
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "AuditSession" WHERE id = ${input.sessionId} FOR UPDATE
    `
    if (locked.length === 0) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')
    const session = await tx.auditSession.findUnique({ where: { id: input.sessionId } })
    if (!session) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')
    if (session.status !== 'OPEN') throw new HttpError(409, 'ลบได้เฉพาะรอบที่ยังเปิดอยู่')
    const scanCount = await tx.scanLog.count({ where: { auditSessionId: input.sessionId } })
    if (scanCount > 0) {
      throw new HttpError(409, 'รอบนี้เริ่มนับไปแล้ว ลบไม่ได้ - ให้ปิดรอบแทน')
    }
    await tx.auditSession.delete({ where: { id: input.sessionId } })
  })
  return { ok: true }
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
  categoryIds: string[]
  productIds: string[]
  categoryName: string | null
  startedAt: string
  closedAt: string | null
  expectedCount: number
  scannedCount: number
  /** จำนวน log ทั้งหมดในรอบ (รวมที่ถูกปฏิเสธ) - ใช้ตัดสินว่าลบรอบได้หรือยัง */
  scanLogCount: number
  matchedCount: number
  missing: AuditUnitRow[] // ของหาย: ระบบว่ามีแต่ยิงไม่เจอ
  surplus: AuditUnitRow[] // ของเกิน: ยิงเจอแต่ระบบว่าเบิกออกไปแล้ว
  unknownSerials: { serial: string; scannedAt: string }[] // ยิงแล้วระบบไม่รู้จัก
  /** สินค้านับจำนวนในขอบเขตรอบนี้ - กรอกยอดนับเทียบกับยอดระบบ */
  quantityLines: QuantityAuditLine[]
}

/** คำนวณผลรอบตรวจนับ (รอบที่ปิดแล้วจะคืน snapshot ที่เก็บไว้) */
export async function buildAuditReport(
  sessionId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<AuditReport> {
  const session = await client.auditSession.findUnique({
    where: { id: sessionId },
    include: { category: true },
  })
  if (!session) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')

  if (session.status === 'CLOSED' && session.report) {
    // รายงานเก่าที่ปิดก่อนมีระบบนับจำนวนจะไม่มี quantityLines - เติมค่าเริ่มต้นกัน UI พัง
    const cached = session.report as unknown as AuditReport
    return {
      ...cached,
      quantityLines: cached.quantityLines ?? [],
      categoryIds: cached.categoryIds ?? (cached.categoryId ? [cached.categoryId] : []),
      productIds: cached.productIds ?? [],
      scanLogCount: cached.scanLogCount ?? 0,
    }
  }

  const scope = sessionScope(session)
  // เงื่อนไข "อยู่ในขอบเขต" ระดับ product - ใช้ร่วมกันทั้งของรายชิ้นและของนับจำนวน
  const scopeCats = [...(scope.categoryId ? [scope.categoryId] : []), ...scope.categoryIds]
  const scopeOr =
    scopeCats.length === 0 && scope.productIds.length === 0
      ? null
      : {
          OR: [
            ...(scopeCats.length > 0 ? [{ categoryId: { in: scopeCats } }] : []),
            ...(scope.productIds.length > 0 ? [{ id: { in: scope.productIds } }] : []),
          ],
        }

  // ของที่ "มีอยู่ในระบบตอนเริ่มรอบ" = รับเข้าก่อนเริ่ม และยังไม่ถูกเบิกก่อนเริ่ม
  // ต้องไม่ใช้ status ปัจจุบันอย่างเดียว เพราะของที่ขายระหว่างรอบจะกลายเป็น OUT
  // แล้วถูกมองข้าม จนรายงานจับคู่ไม่ได้ว่ายิงไปแล้ว
  // กลับกันของที่รับเข้าหลังเริ่มรอบต้องไม่กลายเป็น "ของหาย" ตอนปิดรอบ
  const expectedUnits = await client.serialUnit.findMany({
    where: {
      ...(scopeOr ? { product: scopeOr } : {}),
      AND: [
        { OR: [{ receivedAt: null }, { receivedAt: { lte: session.startedAt } }] },
        { OR: [{ releasedAt: null }, { releasedAt: { gt: session.startedAt } }] },
      ],
    },
    include: unitInclude,
  })

  const acceptedScans = await client.scanLog.findMany({
    where: { auditSessionId: session.id, accepted: true, unitId: { not: null } },
    include: { unit: { include: unitInclude } },
  })

  const scannedUnits = new Map<string, UnitWithProduct>()
  for (const log of acceptedScans) {
    if (log.unit) scannedUnits.set(log.unit.id, log.unit)
  }

  const expectedIds = new Set(expectedUnits.map((u) => u.id))
  const scannedIds = new Set(scannedUnits.keys())

  // ของหาย = ตอนเริ่มรอบมีในระบบ ตอนปิดรอบยังอยู่ แต่ยิงไม่เจอ
  // ถ้าระหว่างรอบถูกเบิกออกไปแล้ว (status OUT) ไม่ใช่ของหาย - ห้ามตัดซ้ำ
  const missingUnits = expectedUnits.filter(
    (u) => u.status === 'IN_STOCK' && !scannedIds.has(u.id)
  )

  // ของเกิน = ยิงเจอ แต่ตอนเริ่มรอบไม่มีในระบบ และยังไม่มีการรับเข้า/เบิกออกใหม่
  // ระหว่างรอบ (ถ้ายิงแล้วขายต่อ ต้องปล่อยเป็น OUT ไม่ดึงกลับเข้าคลัง)
  const surplusUnits = [...scannedUnits.values()].filter(
    (u) =>
      !expectedIds.has(u.id) &&
      u.status === 'OUT' &&
      (!u.receivedAt || u.receivedAt <= session.startedAt) &&
      (!u.releasedAt || u.releasedAt <= session.startedAt)
  )

  const matchedCount = [...scannedIds].filter((id) => expectedIds.has(id)).length

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

  const unknownLogs = await client.scanLog.findMany({
    where: { auditSessionId: session.id, result: 'UNKNOWN_SERIAL' },
    orderBy: { createdAt: 'asc' },
    distinct: ['serial'],
  })

  // ── สินค้านับจำนวนในขอบเขตรอบนี้ + ยอดนับล่าสุดของแต่ละตัว ──
  // บันทึกยอดนับเป็น ScanLog AUDIT ที่ serial=null (แยกจาก log ยิง serial ที่ quantity=1)
  const quantityProducts = await client.product.findMany({
    where: {
      trackingType: 'QUANTITY',
      ...(scopeOr ?? {}),
    },
    include: { category: true },
    orderBy: { name: 'asc' },
  })
  const quantityCountLogs =
    quantityProducts.length > 0
      ? await client.scanLog.findMany({
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

  // นับ log ทุกชนิด (รวมที่ถูกปฏิเสธ) เพื่อให้ปุ่ม "ลบรอบ" ตรงกับเงื่อนไขฝั่งเซิร์ฟเวอร์
  const scanLogCount = await client.scanLog.count({
    where: { auditSessionId: session.id },
  })

  return {
    sessionId: session.id,
    name: session.name,
    status: session.status,
    categoryId: session.categoryId,
    categoryIds: scope.categoryIds,
    productIds: scope.productIds,
    categoryName: session.category?.name ?? null,
    startedAt: session.startedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    expectedCount: expectedUnits.length,
    scannedCount: scannedUnits.size,
    scanLogCount,
    matchedCount,
    missing: missingUnits.map((u) => toRow(u.id)).sort(sortRows),
    surplus: surplusUnits.map((u) => toRow(u.id)).sort(sortRows),
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
  return prisma.$transaction(async (tx) => {
    // ล็อกรอบแบบ exclusive: กันปิดซ้ำ และกันสแกนเขียน log ระหว่างอ่านผลกับปรับสต็อก
    // (auditScan/auditQuantityCount ใช้ FOR SHARE จึงรอตรงนี้จนปิดเสร็จ)
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "AuditSession" WHERE id = ${input.sessionId} FOR UPDATE
    `
    if (locked.length === 0) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')
    const session = await tx.auditSession.findUnique({ where: { id: input.sessionId } })
    if (!session) throw new HttpError(404, 'ไม่พบรอบตรวจนับนี้')
    if (session.status === 'CLOSED') throw new HttpError(409, 'รอบตรวจนับนี้ปิดไปแล้ว')

    // คำนวณใน transaction เดียวกับตอนปรับ เพื่อให้ snapshot ตรงกับสต็อกที่ถูกแก้จริง
    let report = await buildAuditReport(input.sessionId, tx)

    // ล็อก serial ที่จะถูกปรับก่อนสรุปผลรอบสุดท้าย
    // scanIn/scanOut ใช้ advisory lock ตัวเดียวกันอยู่แล้ว จึงรอกันจนจบ transaction
    // ถ้าปล่อยให้เบิกออกแทรกหลัง snapshot เครื่องเดียวกันอาจได้ทั้ง log MISSING และ OUT
    // ล็อกตามลำดับ serial เพื่อกัน deadlock และอ่านรายงานใหม่หลังล็อกทุกครั้ง
    // (ถ้ามีของเคลื่อนไหวเพิ่มระหว่างทาง จะเห็นรายการใหม่แล้วล็อกเพิ่มจนกว่านิ่ง)
    const lockedSerials = new Set<string>()
    while (true) {
      const targets = [
        ...new Set([...report.missing, ...report.surplus].map((r) => r.serial)),
      ].sort()
      const pending = targets.filter((serial) => !lockedSerials.has(serial))
      if (pending.length === 0) break
      for (const serial of pending) {
        await lockSerial(tx, serial)
        lockedSerials.add(serial)
      }
      report = await buildAuditReport(input.sessionId, tx)
    }

    const closedAt = new Date()
    const finalReport: AuditReport = {
      ...report,
      status: 'CLOSED',
      closedAt: closedAt.toISOString(),
    }

    if (input.applyAdjustments) {
      // ── ของรายชิ้น: ของหาย ──
      // updateManyAndReturn อัปเดตครั้งเดียวและคืนเฉพาะแถวที่ยังเป็น IN_STOCK จริง
      // ถ้ามีคนเบิกออกไปพอดีระหว่างปิดรอบ แถวนั้นจะไม่ถูกเขียน log MISSING ซ้ำ
      const missingIds = report.missing.map((r) => r.unitId)
      const adjustedMissing =
        missingIds.length > 0
          ? await tx.serialUnit.updateManyAndReturn({
              where: { id: { in: missingIds }, status: 'IN_STOCK' },
              data: { status: 'OUT', releasedAt: closedAt },
              select: { id: true, serial: true, productId: true },
            })
          : []
      if (adjustedMissing.length > 0) {
        // log ก่อนตัดออก เพื่อให้ย้อนดูได้ว่าของหายจากรอบตรวจนับไหน ไม่ใช่เบิกออกตามปกติ
        await tx.scanLog.createMany({
          data: adjustedMissing.map((u) => ({
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
      }

      // ── ของรายชิ้น: ของเกิน ──
      // มี log FOUND_BUT_OUT จากตอนยิงสแกนอยู่แล้ว ไม่ต้องเขียนซ้ำ
      // เงื่อนไข status = OUT กันไม่ให้ทับของที่เพิ่งถูกสแกนรับเข้าหรือเบิกไปแล้ว
      if (report.surplus.length > 0) {
        await tx.serialUnit.updateMany({
          where: {
            id: { in: report.surplus.map((r) => r.unitId) },
            status: 'OUT',
          },
          data: { status: 'IN_STOCK', receivedAt: closedAt, releasedAt: null },
        })
      }

      // ── ของนับจำนวน ──
      // ห้ามเอาค่ายอดนับเก่าไปทับยอดที่เพิ่งรับ/เบิกหลังตอนนับ (ของหายเงียบ)
      // ถ้ามีการเคลื่อนไหวหลังเวลานับ ให้ปิดรอบไม่สำเร็จและให้นับใหม่
      type CountedLine = QuantityAuditLine & { counted: number; countedAt: string }
      const countedLines = report.quantityLines.filter(
        (l): l is CountedLine => l.counted !== null && l.countedAt !== null
      )
      const stale: string[] = []
      const prepared: { line: CountedLine; current: number }[] = []
      // ล็อกสินค้าตาม id เพื่อกัน deadlock กับรายการอื่นที่ล็อกทีละตัว
      for (const line of [...countedLines].sort((a, b) => a.productId.localeCompare(b.productId))) {
        await lockProduct(tx, line.productId)
        const product = await tx.product.findUnique({
          where: { id: line.productId },
          select: { stockQty: true },
        })
        if (!product) continue
        const moved = await tx.scanLog.count({
          where: {
            productId: line.productId,
            accepted: true,
            type: { in: ['IN', 'OUT'] },
            createdAt: { gte: new Date(line.countedAt) },
          },
        })
        if (moved > 0) {
          stale.push(`"${line.productName}"`)
          continue
        }
        prepared.push({ line, current: product.stockQty })
      }
      if (stale.length > 0) {
        throw new HttpError(
          409,
          `ยอดนับของ ${stale.join(', ')} เก่ากว่าการรับ/เบิกครั้งล่าสุด กรุณานับใหม่ก่อนปิดรอบ`
        )
      }
      for (const { line, current } of prepared) {
        const delta = line.counted - current
        if (delta === 0) continue
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQty: line.counted },
        })
        // เก็บ log การปรับยอดด้วย เพื่อให้ย้อนดูได้ว่าใครปรับเท่าไรในรอบไหน
        await tx.scanLog.create({
          data: {
            serial: null,
            quantity: Math.abs(delta),
            type: 'AUDIT',
            result: 'OK',
            accepted: true,
            message: `ปรับยอดจากรอบ "${session.name}": ระบบ ${current} → นับได้ ${line.counted} (${
              delta > 0 ? 'เพิ่ม' : 'ลด'
            } ${Math.abs(delta)})`,
            userId: input.userId,
            productId: line.productId,
            unitId: null,
            auditSessionId: input.sessionId,
          },
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

    return finalReport
  }, { maxWait: 10_000, timeout: 60_000 })
}

// ────────────────────────────── รายงานคงเหลือ ──────────────────────────────

export type StockReportFilters = {
  categoryId?: string | null
  /** ใช้ภายในตอนแบ่ง export ใหญ่เป็นทีละสินค้า */
  productId?: string | null
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
    /** ชื่อผู้ขายของของที่เหลือ (เจ้าเดียว/หลายเจ้า) หรือใบรับเข้าล่าสุด (ของนับจำนวน), null = ไม่ระบุ */
    vendorName: string | null
  }[]
  totalInStock: number
}

export function productFilter(filters: StockReportFilters): Prisma.ProductWhereInput | undefined {
  const and: Prisma.ProductWhereInput[] = []
  if (filters.categoryId) and.push({ categoryId: filters.categoryId })
  if (filters.productId) and.push({ id: filters.productId })
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
 *
 * หักยอดคืนของที่เบิกผิด (IN + RETURNED) ออกด้วย - ไม่งั้นกดคืนแล้วของในคลังกลับมา
 * แต่ยอด "เบิกออกไปแล้ว" ยังค้างเท่าเดิม สรุปยอดจะไม่ลงตัว
 */
async function sumOutQuantity(
  productIds: string[],
  opts: { customerId?: string | null } = {}
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map()
  const base = {
    accepted: true,
    productId: { in: productIds },
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
  }
  const [outGrouped, returnedGrouped] = await Promise.all([
    prisma.scanLog.groupBy({
      by: ['productId'],
      where: { ...base, type: 'OUT' },
      _sum: { quantity: true },
    }),
    prisma.scanLog.groupBy({
      by: ['productId'],
      where: { ...base, type: 'IN', result: 'RETURNED' },
      _sum: { quantity: true },
    }),
  ])
  const returned = new Map(returnedGrouped.map((g) => [g.productId!, g._sum.quantity ?? 0]))
  // กันติดลบเผื่อข้อมูลเก่าที่คืนแบบไม่ผูก log (ยิงรับเข้าคืนเองสมัยก่อนมีปุ่มคืนของ)
  return new Map(
    outGrouped.map((g) => [g.productId!, Math.max(0, (g._sum.quantity ?? 0) - (returned.get(g.productId!) ?? 0))])
  )
}

/**
 * ชื่อผู้ขายจากใบรับเข้าล่าสุดของสินค้านับจำนวน (ของแบบนี้ไม่มี vendor ติดตัว)
 * ไม่มีใบรับเข้าที่ระบุผู้ขายเลย = null (ให้ UI โชว์ "ไม่ระบุ")
 */
export async function quantityVendorNames(productIds: string[]): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map()
  const logs = await prisma.scanLog.findMany({
    where: { productId: { in: productIds }, type: 'IN', accepted: true, vendorId: { not: null } },
    orderBy: { createdAt: 'desc' },
    distinct: ['productId'],
    include: { vendor: { select: { name: true } } },
  })
  const map = new Map<string, string>()
  for (const log of logs) {
    if (log.productId && log.vendor?.name) map.set(log.productId, log.vendor.name)
  }
  return map
}

/** ชื่อผู้ขายของของรายชิ้นที่เหลืออยู่ - เจ้าเดียวโชว์ชื่อ คละเจ้าโชว์ "หลายเจ้า" ไม่มีโชว์ null */
export function serialVendorName(vendorNames: (string | null)[]): string | null {
  const names = [...new Set(vendorNames.filter((n): n is string => !!n))]
  if (names.length === 0) return null
  if (names.length > 1) return 'หลายเจ้า'
  return names[0]
}

/**
 * สินค้านับจำนวนที่เคยรับเข้าจาก vendor นี้
 * (ยอด stockQty แยกตามเจ้าไม่ได้เพราะใบเบิกไม่มี vendor - ใช้ความเกี่ยวข้องแทน:
 * กรอง vendor แล้วโชว์เฉพาะสินค้าที่เคยรับเข้าจากเจ้านั้น)
 */
export async function quantityVendorTraffic(
  productIds: string[],
  vendorId: string
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set()
  const grouped = await prisma.scanLog.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, type: 'IN', accepted: true, vendorId },
  })
  return new Set(grouped.map((g) => g.productId!))
}

export async function buildStockReport(filters: StockReportFilters = {}): Promise<{
  categories: StockReportRow[]
  grandTotalInStock: number
}> {
  const where = productFilter(filters)
  const vendorId = filters.vendorId || null

  // ── หา productIds ที่ผ่าน timePeriod filter ──
  // "รายงานคงเหลือ" กรองช่วงเวลา = สินค้าที่มี "รับเข้า" ในช่วงนั้น
  // (ของรายชิ้นดู receivedAt, ของนับจำนวนดู log IN) ไม่ใช่ความเคลื่อนไหวทุกชนิด
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
            type: 'IN',
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
        // ของที่คืนแล้วไม่ควรทำให้สินค้านั้นยังถือว่า "เกี่ยวกับลูกค้ารายนี้"
        reversedBy: null,
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
      where: {
        accepted: true,
        type: 'OUT',
        customerId: filters.customerId,
        // รายการที่ถูกคืนแล้วไม่ควรแสดงว่าเป็นของที่ยังขายให้ลูกค้ารายนี้
        reversedBy: null,
      },
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
            ? { where: unitWhere, select: { status: true, vendor: { select: { name: true } } } }
            : { select: { status: true, vendor: { select: { name: true } } } },
        },
      },
    },
  })

  // ── ยอดเบิกออกสะสมของสินค้านับจำนวน (กรอง vendor/customer ตามตัวกรองที่เลือก) ──
  const quantityIds = categories.flatMap((c) =>
    c.products.filter((p) => p.trackingType === 'QUANTITY').map((p) => p.id)
  )
  const [outQty, qtyVendors, qtyTraffic] = await Promise.all([
    sumOutQuantity(quantityIds, {
      customerId: filters.customerId,
    }),
    quantityVendorNames(quantityIds),
    vendorId && !customerSerials && quantityIds.length > 0
      ? quantityVendorTraffic(quantityIds, vendorId)
      : Promise.resolve(null as Set<string> | null),
  ])

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
          vendorName: qtyVendors.get(p.id) ?? null,
        }
      }
      const inStockUnits = p.units.filter((u) => u.status === 'IN_STOCK')
      const inStock = inStockUnits.length
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        trackingType: 'SERIAL' as const,
        unitLabel: null,
        inStock,
        out: p.units.length - inStock,
        vendorName: serialVendorName(inStockUnits.map((u) => u.vendor?.name ?? null)),
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
  // (ของนับจำนวนแยกยอดตามเจ้าไม่ได้ - ตอนกรอง vendor โชว์เฉพาะตัวที่เคยรับเข้าจากเจ้านี้)
  const hasFilter = vendorId || customerSerials
  const filtered = hasFilter
    ? rows
        .map((r) => {
          const products = r.products.filter((p) =>
            p.trackingType === 'QUANTITY' && vendorId && !customerSerials
              ? (qtyTraffic?.has(p.productId) ?? false) && p.inStock + p.out > 0
              : p.inStock + p.out > 0
          )
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

/**
 * เพดานของ export แบบโหลดทั้งหมดเข้าหน่วยความจำ
 * งาน export ปกติยังใช้เพดานนี้ ส่วนงานเบื้องหลังจะสลับไปเขียนไฟล์แบบ streaming เมื่อเกิน
 *
 * EXPORT_ROW_LIMIT มีไว้ให้เทสย่อขนาดข้อมูลลงเท่านั้น (ไม่ตั้งใน production)
 */
export const DEFAULT_EXPORT_ROW_LIMIT = 50_000

export function exportRowLimit(): number {
  const configured = Number(process.env.EXPORT_ROW_LIMIT)
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_EXPORT_ROW_LIMIT
}

/** ใช้แยกแยะว่า error เกิดจากข้อมูลเกินเพดาน เพื่อสลับไปเขียนแบบ streaming */
export function isExportLimitError(err: unknown): boolean {
  return err instanceof HttpError && err.status === 413
}

function assertExportSize(count: number) {
  const limit = exportRowLimit()
  if (count > limit) {
    throw new HttpError(
      413,
      `ข้อมูลเกิน ${limit.toLocaleString('th-TH')} แถว กรุณากรองช่วงเวลาหรือเงื่อนไขให้แคบลง`
    )
  }
}

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
    /** ชื่อผู้ขายของที่เบิกออก (serial) / ใบรับเข้าล่าสุด (นับจำนวน), null = ไม่ระบุ */
    vendorName: string | null
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
  // "รายงานเบิกออก" กรองช่วงเวลา = สินค้าที่มี "เบิกออก" ในช่วงนั้น
  let timePeriodProductIds: Set<string> | null = null
  if (filters.timePeriod && filters.timePeriod !== 'all') {
    const { timePeriodRange } = await import('./date-range')
    const range = timePeriodRange(filters.timePeriod)
    if (range) {
      const [scanLogGrouped, releasedGrouped] = await Promise.all([
        prisma.scanLog.groupBy({
          by: ['productId'],
          where: {
            accepted: true,
            type: 'OUT',
            createdAt: { gte: range.from, lte: range.to },
            productId: { not: null },
          },
        }),
        prisma.serialUnit.groupBy({
          by: ['productId'],
          where: {
            releasedAt: { gte: range.from, lte: range.to },
          },
        }),
      ])
      timePeriodProductIds = new Set([
        ...scanLogGrouped.map((g) => g.productId!),
        ...releasedGrouped.map((g) => g.productId),
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
        // ของที่คืนแล้วไม่ควรทำให้สินค้านั้นยังถือว่า "เกี่ยวกับลูกค้ารายนี้"
        reversedBy: null,
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
      where: {
        accepted: true,
        type: 'OUT',
        customerId: filters.customerId,
        // รายการที่ถูกคืนแล้วไม่ควรแสดงว่าเป็นของที่ยังขายให้ลูกค้ารายนี้
        reversedBy: null,
      },
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
          units: { where: unitWhere, select: { status: true, vendor: { select: { name: true } } } },
        },
      },
    },
  })

  // ── ยอดเบิกออกสะสมของสินค้านับจำนวน (รวม quantity) ──
  const outQuantityIds = categories.flatMap((c) =>
    c.products.filter((p) => p.trackingType === 'QUANTITY').map((p) => p.id)
  )
  const [outQtySums, outQtyVendors, outQtyTraffic] = await Promise.all([
    // ใบเบิกไม่มี vendorId จึงนับยอดเบิกแบบไม่กรอง vendor แล้วค่อยกรองแถวด้วย traffic แทน
    sumOutQuantity(outQuantityIds, {
      customerId: filters.customerId,
    }),
    quantityVendorNames(outQuantityIds),
    vendorId && outQuantityIds.length > 0
      ? quantityVendorTraffic(outQuantityIds, vendorId)
      : Promise.resolve(null as Set<string> | null),
  ])

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
            vendorName: outQtyVendors.get(p.id) ?? null,
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
          vendorName: serialVendorName(p.units.map((u) => u.vendor?.name ?? null)),
        }
      })
      .filter((p) =>
        p.trackingType === 'QUANTITY' && vendorId
          ? (outQtyTraffic?.has(p.productId) ?? false) && p.out > 0
          : p.out > 0
      )
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
  /** เหมือน StockReportRow - ชื่อผู้ขายของของที่เหลือ/ใบรับเข้าล่าสุด, null = ไม่ระบุ */
  vendorName: string | null
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
  // "รายงานคงเหลือ" กรองช่วงเวลา = สินค้าที่มี "รับเข้า" ในช่วงนั้น
  // (ของรายชิ้นดู receivedAt, ของนับจำนวนดู log IN) ไม่ใช่ความเคลื่อนไหวทุกชนิด
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
            type: 'IN',
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
        // ของที่คืนแล้วไม่ควรทำให้สินค้านั้นยังถือว่า "เกี่ยวกับลูกค้ารายนี้"
        reversedBy: null,
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

  // นับก่อนดึง units เข้าหน่วยความจำ - กัน export รายงานละเอียดใหญ่เกิน
  assertExportSize(
    await prisma.serialUnit.count({
      where: { product: finalWhere, ...(vendorId ? { vendorId } : {}) },
    })
  )

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
        // คืนของแล้ว = ไม่นับว่าเป็นของที่ยังอยู่กับลูกค้ารายนี้
        reversedBy: null,
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
  const [detailedOutQty, detailedQtyVendors, detailedQtyTraffic] = await Promise.all([
    sumOutQuantity(detailedQtyIds, {
      customerId: filters.customerId,
    }),
    quantityVendorNames(detailedQtyIds),
    vendorId && !customerSerials && detailedQtyIds.length > 0
      ? quantityVendorTraffic(detailedQtyIds, vendorId)
      : Promise.resolve(null as Set<string> | null),
  ])

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
          vendorName: detailedQtyVendors.get(p.id) ?? null,
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
      const inStockUnits = unitsToShow.filter((u) => u.status === 'IN_STOCK')
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
        vendorName: serialVendorName(inStockUnits.map((u) => u.vendor?.name ?? null)),
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
          const products = r.products.filter((p) =>
            p.trackingType === 'QUANTITY' && vendorId && !customerSerials
              ? (detailedQtyTraffic?.has(p.productId) ?? false) && p.inStock + p.out > 0
              : p.inStock + p.out > 0
          )
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
  // "รายงานเบิกออก" กรองช่วงเวลา = สินค้าที่มี "เบิกออก" ในช่วงนั้น
  let timePeriodProductIds: Set<string> | null = null
  if (filters.timePeriod && filters.timePeriod !== 'all') {
    const { timePeriodRange } = await import('./date-range')
    const range = timePeriodRange(filters.timePeriod)
    if (range) {
      const [scanLogGrouped, releasedGrouped] = await Promise.all([
        prisma.scanLog.groupBy({
          by: ['productId'],
          where: {
            accepted: true,
            type: 'OUT',
            createdAt: { gte: range.from, lte: range.to },
            productId: { not: null },
          },
        }),
        prisma.serialUnit.groupBy({
          by: ['productId'],
          where: {
            releasedAt: { gte: range.from, lte: range.to },
          },
        }),
      ])
      timePeriodProductIds = new Set([
        ...scanLogGrouped.map((g) => g.productId!),
        ...releasedGrouped.map((g) => g.productId),
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
        // ของที่คืนแล้วไม่ควรทำให้สินค้านั้นยังถือว่า "เกี่ยวกับลูกค้ารายนี้"
        reversedBy: null,
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
      where: {
        accepted: true,
        type: 'OUT',
        customerId: filters.customerId,
        // รายการที่ถูกคืนแล้วไม่ควรแสดงว่าเป็นของที่ยังขายให้ลูกค้ารายนี้
        reversedBy: null,
      },
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

  // นับก่อนดึง units เข้าหน่วยความจำ - กัน export รายงานละเอียดใหญ่เกิน
  assertExportSize(
    await prisma.serialUnit.count({
      where: { product: finalWhere, ...unitWhere },
    })
  )

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
    customerId: filters.customerId,
  })
  const outDetailedQtyTraffic =
    vendorId && outDetailedQtyIds.length > 0
      ? await quantityVendorTraffic(outDetailedQtyIds, vendorId)
      : null

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
        .filter((p) =>
          p.trackingType === 'QUANTITY' && vendorId
            ? (outDetailedQtyTraffic?.has(p.productId) ?? false) && p.out > 0
            : p.out > 0
        )
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
  /** รายการเบิกนี้ถูกคืนเข้าคลังไปแล้วหรือยัง */
  reversed: boolean
  /** ปุ่มคืนของควรแสดงหรือไม่ - ของต้องยัง OUT อยู่จริง ไม่ใช่แค่ log ยังไม่ถูก mark */
  canReturn: boolean
}

const scanLogInclude = {
  user: { select: { displayName: true } },
  product: { select: { name: true } },
  vendor: { select: { name: true } },
  customer: { select: { code: true, name: true } },
  auditSession: { select: { name: true } },
  reversedBy: { select: { id: true } },
  unit: { select: { status: true } },
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
    reversed: !!log.reversedBy,
    canReturn:
      log.type === 'OUT' &&
      log.accepted &&
      log.result === 'OK' &&
      !log.reversedBy &&
      (log.unit ? log.unit.status === 'OUT' : log.serial === null),
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
    /** ประเภทของนี้เปิดให้แนบรูปอุปกรณ์หรือไม่ (ตั้งโดยผู้ดูแลระบบ) */
    photosEnabled: boolean
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
          photosEnabled: unit.product.category.photosEnabled,
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

// ─────────────────────── ประวัติการขาย (เบิกออกเหตุผล SALE) ───────────────────────

export type SaleRow = {
  id: string
  at: string
  serial: string | null
  quantity: number
  productName: string
  sku: string | null
  customerName: string | null
  projectName: string | null
  userName: string
  note: string | null
  reversed: boolean
}

export type SalesReport = {
  rows: SaleRow[]
  total: number
}

export type SalesReportFilters = {
  customerId?: string | null
  projectId?: string | null
  q?: string | null
  from?: Date | null
  to?: Date | null
}

const salesLogInclude = {
  customer: true,
  product: true,
  project: { select: { name: true } },
  user: { select: { displayName: true } },
  reversedBy: { select: { id: true } },
} satisfies Prisma.ScanLogInclude

type SalesLog = Prisma.ScanLogGetPayload<{ include: typeof salesLogInclude }>

function salesReportWhere(filters: SalesReportFilters): Prisma.ScanLogWhereInput {
  const q = filters.q?.trim()
  return {
    type: 'OUT',
    reason: 'SALE',
    accepted: true,
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { serial: { contains: q, mode: 'insensitive' } },
            { product: { name: { contains: q, mode: 'insensitive' } } },
            { product: { sku: { contains: q, mode: 'insensitive' } } },
            { customer: { name: { contains: q, mode: 'insensitive' } } },
            { customer: { code: { contains: q, mode: 'insensitive' } } },
            { note: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
}

function toSaleRow(log: SalesLog): SaleRow {
  return {
    id: log.id,
    at: log.createdAt.toISOString(),
    serial: log.serial,
    quantity: log.quantity,
    productName: log.product?.name ?? '-',
    sku: log.product?.sku ?? null,
    customerName: log.customer ? `${log.customer.code} · ${log.customer.name}` : null,
    projectName: log.project?.name ?? null,
    userName: log.user.displayName,
    note: log.note,
    reversed: log.reversedBy !== null,
  }
}

/** จำนวนรายการขายทั้งหมด - ใช้เขียนหัวไฟล์ก่อนเริ่มไล่อ่านแบบทีละหน้า */
export function countSalesReport(filters: SalesReportFilters = {}): Promise<number> {
  return prisma.scanLog.count({ where: salesReportWhere(filters) })
}

/**
 * ไล่อ่านประวัติการขายทีละหน้า เรียงใหม่สุดก่อนเหมือนหน้าเว็บ
 * ใช้กับ export ใหญ่ที่ไม่อยากโหลดทุกแถวเข้า memory พร้อมกัน
 */
export async function* iterateSalesReportRows(
  filters: SalesReportFilters = {},
  pageSize = 1000
): AsyncGenerator<SaleRow> {
  const base = salesReportWhere(filters)
  let cursor: { createdAt: Date; id: string } | null = null

  while (true) {
    const page: SalesLog[] = await prisma.scanLog.findMany({
      where: cursor
        ? {
            AND: [
              base,
              {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              },
            ],
          }
        : base,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: salesLogInclude,
      take: pageSize,
    })

    for (const log of page) yield toSaleRow(log)
    if (page.length < pageSize) break

    const last: SalesLog = page[page.length - 1]
    cursor = { createdAt: last.createdAt, id: last.id }
  }
}

/** ประวัติการขายตามตัวกรอง (export เอาไปทั้งหมด แต่ตัดเพดานกันไฟล์ใหญ่เกิน memory) */
export async function buildSalesReport(filters: SalesReportFilters = {}): Promise<SalesReport> {
  const logs = await prisma.scanLog.findMany({
    where: salesReportWhere(filters),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: salesLogInclude,
    take: exportRowLimit() + 1,
  })
  assertExportSize(logs.length)

  return {
    total: logs.length,
    rows: logs.map(toSaleRow),
  }
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

type MovementDetailLog = Prisma.ScanLogGetPayload<{ include: typeof scanLogDetailInclude }>

function movementDetailWhere(
  input: StockReportFilters & { from: Date; to: Date }
): Prisma.ScanLogWhereInput {
  if (input.from > input.to) throw new HttpError(400, 'วันเริ่มต้นต้องไม่เกินวันสิ้นสุด')
  const product = productFilter(input)
  return {
    accepted: true,
    createdAt: { gte: input.from, lte: input.to },
    ...(input.vendorId ? { vendorId: input.vendorId } : {}),
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(product ? { product } : {}),
  }
}

function toMovementDetailRow(l: MovementDetailLog): MovementDetailRow {
  return {
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
  }
}

/** ยอดรวมสำหรับหัวรายงาน โดยไม่ต้องโหลดแถวทั้งหมด */
export async function movementDetailTotals(
  input: StockReportFilters & { from: Date; to: Date }
): Promise<{ totalIn: number; totalOut: number; totalRows: number }> {
  const grouped = await prisma.scanLog.groupBy({
    by: ['type'],
    where: movementDetailWhere(input),
    _sum: { quantity: true },
    _count: { _all: true },
  })
  return {
    totalIn: grouped.find((g) => g.type === 'IN')?._sum.quantity ?? 0,
    totalOut: grouped.find((g) => g.type === 'OUT')?._sum.quantity ?? 0,
    totalRows: grouped.reduce((sum, g) => sum + g._count._all, 0),
  }
}

/** ไล่อ่านความเคลื่อนไหวทีละหน้า (เก่า -> ใหม่) สำหรับ export ใหญ่ */
export async function* iterateMovementDetailRows(
  input: StockReportFilters & { from: Date; to: Date },
  pageSize = 1000
): AsyncGenerator<MovementDetailRow> {
  const base = movementDetailWhere(input)
  let cursor: { createdAt: Date; id: string } | null = null

  while (true) {
    const page: MovementDetailLog[] = await prisma.scanLog.findMany({
      where: cursor
        ? {
            AND: [
              base,
              {
                OR: [
                  { createdAt: { gt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                ],
              },
            ],
          }
        : base,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: scanLogDetailInclude,
      take: pageSize,
    })

    for (const log of page) yield toMovementDetailRow(log)
    if (page.length < pageSize) break

    const last: MovementDetailLog = page[page.length - 1]
    cursor = { createdAt: last.createdAt, id: last.id }
  }
}

/**
 * รายงานความเคลื่อนไหวแบบละเอียด - แสดง Transaction History ทั้งหมด
 * ใช้สำหรับ Tab ความเคลื่อนไหว และ Export
 * ไม่ใช้ timePeriod filter (movement ไม่มี timePeriod)
 */
export async function buildMovementDetail(
  input: StockReportFilters & { from: Date; to: Date }
): Promise<MovementDetailReport> {
  const logs = await prisma.scanLog.findMany({
    where: movementDetailWhere(input),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: scanLogDetailInclude,
    take: exportRowLimit() + 1,
  })
  assertExportSize(logs.length)

  const rows = logs.map(toMovementDetailRow)
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
