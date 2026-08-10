import { describe, expect, it } from 'vitest'
import {
  decideAuditScan,
  decideScanIn,
  decideScanOut,
  diffAudit,
  normalizeSerial,
  validateSerial,
  type UnitSnapshot,
} from '@/lib/scan-rules'

const unit = (over: Partial<UnitSnapshot> = {}): UnitSnapshot => ({
  id: 'u1',
  serial: 'ABC123',
  productId: 'p1',
  status: 'IN_STOCK',
  productName: 'สินค้า A',
  categoryId: 'c1',
  ...over,
})

describe('normalizeSerial', () => {
  it('ตัดช่องว่างและทำเป็นตัวพิมพ์ใหญ่', () => {
    expect(normalizeSerial('  abc-123 ')).toBe('ABC-123')
  })

  it('ตัด \\r ที่เครื่องสแกนบางรุ่นแถมมาท้าย serial', () => {
    expect(normalizeSerial('ABC123\r')).toBe('ABC123')
    expect(normalizeSerial('ABC123\r\n')).toBe('ABC123')
    expect(normalizeSerial('\tABC123')).toBe('ABC123')
  })

  it('ตัดช่องว่างที่แทรกกลางออกด้วย', () => {
    expect(normalizeSerial('AB C1 23')).toBe('ABC123')
  })
})

describe('validateSerial', () => {
  it('ผ่านเมื่อรูปแบบถูกต้อง', () => {
    expect(validateSerial('nb0001')).toEqual({ ok: true, serial: 'NB0001' })
  })

  it('ไม่รับค่าว่าง (เผลอกด Enter เปล่า)', () => {
    expect(validateSerial('')).toMatchObject({ ok: false })
    expect(validateSerial('   ')).toMatchObject({ ok: false })
  })

  it('ไม่รับ serial ที่สั้นเกินไป', () => {
    expect(validateSerial('A1')).toMatchObject({ ok: false })
  })

  it('ไม่รับ serial ที่ยาวเกิน 64 ตัว', () => {
    expect(validateSerial('A'.repeat(65))).toMatchObject({ ok: false })
  })

  it('ไม่รับอักขระแปลกปลอม', () => {
    expect(validateSerial('ABC#123')).toMatchObject({ ok: false })
    expect(validateSerial('-ABC')).toMatchObject({ ok: false })
  })

  it('รับ . _ - / ที่พบบ่อยใน serial', () => {
    expect(validateSerial('AB-12.3_4/5')).toEqual({ ok: true, serial: 'AB-12.3_4/5' })
  })
})

describe('decideScanIn', () => {
  it('serial ใหม่ -> สร้างและรับเข้า', () => {
    expect(decideScanIn(null, 'p1')).toMatchObject({ result: 'CREATED', accepted: true })
  })

  it('serial ที่เคยเบิกออก -> รับกลับเข้าคลัง', () => {
    expect(decideScanIn(unit({ status: 'OUT' }), 'p1')).toMatchObject({
      result: 'RETURNED',
      accepted: true,
    })
  })

  it('ยิงซ้ำทั้งที่ยังอยู่ในคลัง -> ปฏิเสธ', () => {
    expect(decideScanIn(unit(), 'p1')).toMatchObject({ result: 'DUPLICATE', accepted: false })
  })

  it('serial ผูกกับสินค้าอื่นอยู่ -> ปฏิเสธ และบอกชื่อสินค้าเดิม', () => {
    const decision = decideScanIn(unit({ productId: 'p2' }), 'p1')
    expect(decision).toMatchObject({ result: 'PRODUCT_MISMATCH', accepted: false })
    expect(decision.message).toContain('สินค้า A')
  })

  it('สินค้าไม่ตรงกันสำคัญกว่าสถานะ - ของถูกเบิกออกแล้วแต่คนละสินค้าก็ยังปฏิเสธ', () => {
    expect(decideScanIn(unit({ productId: 'p2', status: 'OUT' }), 'p1')).toMatchObject({
      result: 'PRODUCT_MISMATCH',
      accepted: false,
    })
  })
})

describe('decideScanOut', () => {
  it('ของอยู่ในคลัง -> เบิกออกได้', () => {
    expect(decideScanOut(unit())).toMatchObject({ result: 'OK', accepted: true })
  })

  it('ไม่รู้จัก serial -> ปฏิเสธ', () => {
    expect(decideScanOut(null)).toMatchObject({ result: 'UNKNOWN_SERIAL', accepted: false })
  })

  it('เบิกออกไปแล้ว -> ปฏิเสธ กันเบิกซ้ำ', () => {
    expect(decideScanOut(unit({ status: 'OUT' }))).toMatchObject({
      result: 'ALREADY_OUT',
      accepted: false,
    })
  })
})

describe('decideAuditScan', () => {
  const ctx = { scopeCategoryId: null, alreadyScanned: false }

  it('ของในคลัง -> นับได้', () => {
    expect(decideAuditScan(unit(), ctx)).toMatchObject({ result: 'OK', accepted: true })
  })

  it('serial ไม่รู้จัก -> เตือนทันที ไม่รับ', () => {
    expect(decideAuditScan(null, ctx)).toMatchObject({
      result: 'UNKNOWN_SERIAL',
      accepted: false,
    })
  })

  it('ยิงซ้ำในรอบเดียวกัน -> เตือน ไม่นับซ้ำ', () => {
    expect(decideAuditScan(unit(), { ...ctx, alreadyScanned: true })).toMatchObject({
      result: 'DUPLICATE',
      accepted: false,
    })
  })

  it('อยู่นอกหมวดที่กำลังนับ -> ไม่นับ', () => {
    expect(decideAuditScan(unit({ categoryId: 'c9' }), { ...ctx, scopeCategoryId: 'c1' })).toMatchObject({
      result: 'NOT_IN_SCOPE',
      accepted: false,
    })
  })

  it('อยู่ในหมวดที่กำลังนับ -> นับได้', () => {
    expect(decideAuditScan(unit(), { ...ctx, scopeCategoryId: 'c1' })).toMatchObject({
      result: 'OK',
      accepted: true,
    })
  })

  it('ระบบว่าเบิกออกแล้วแต่เจอของจริง -> รับไว้เป็นของเกิน', () => {
    expect(decideAuditScan(unit({ status: 'OUT' }), ctx)).toMatchObject({
      result: 'FOUND_BUT_OUT',
      accepted: true,
    })
  })

  it('ยิงซ้ำสำคัญกว่าสถานะของ - ของเกินที่ยิงซ้ำก็ยังนับเป็นซ้ำ', () => {
    expect(decideAuditScan(unit({ status: 'OUT' }), { ...ctx, alreadyScanned: true })).toMatchObject({
      result: 'DUPLICATE',
      accepted: false,
    })
  })
})

describe('diffAudit', () => {
  it('นับครบ -> ไม่มีหาย ไม่มีเกิน', () => {
    const diff = diffAudit({ expectedUnitIds: ['a', 'b'], scannedUnitIds: ['b', 'a'] })
    expect(diff.missingUnitIds).toEqual([])
    expect(diff.surplusUnitIds).toEqual([])
    expect(diff.matchedUnitIds.sort()).toEqual(['a', 'b'])
  })

  it('ยิงไม่ครบ -> ตัวที่ขาดคือของหาย', () => {
    const diff = diffAudit({ expectedUnitIds: ['a', 'b', 'c'], scannedUnitIds: ['a'] })
    expect(diff.missingUnitIds.sort()).toEqual(['b', 'c'])
    expect(diff.surplusUnitIds).toEqual([])
  })

  it('ยิงเจอของที่ระบบไม่ได้นับว่าอยู่ในคลัง -> เป็นของเกิน', () => {
    const diff = diffAudit({ expectedUnitIds: ['a'], scannedUnitIds: ['a', 'z'] })
    expect(diff.surplusUnitIds).toEqual(['z'])
    expect(diff.missingUnitIds).toEqual([])
  })

  it('ยิงซ้ำ id เดิมไม่ทำให้ยอดบวม', () => {
    const diff = diffAudit({ expectedUnitIds: ['a', 'a'], scannedUnitIds: ['a', 'a', 'a'] })
    expect(diff.expectedCount).toBe(1)
    expect(diff.scannedCount).toBe(1)
  })

  it('คลังว่างแต่ยิงเจอของ -> เกินทั้งหมด', () => {
    const diff = diffAudit({ expectedUnitIds: [], scannedUnitIds: ['x', 'y'] })
    expect(diff.surplusUnitIds.sort()).toEqual(['x', 'y'])
    expect(diff.expectedCount).toBe(0)
  })
})
