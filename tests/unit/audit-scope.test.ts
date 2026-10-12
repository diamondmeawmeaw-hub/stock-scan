import { describe, expect, it } from 'vitest'
import { isInScope } from '@/lib/scan-service'

const prod = (id: string, categoryId: string) => ({ id, categoryId })

describe('isInScope (ขอบเขตรอบตรวจนับ)', () => {
  it('ว่างทั้งหมด = ทั้งคลัง', () => {
    expect(
      isInScope({ categoryId: null, categoryIds: [], productIds: [] }, prod('p1', 'c9'))
    ).toBe(true)
  })

  it('รอบเก่า (categoryId อย่างเดียว) เทียบเท่าเดิม', () => {
    const s = { categoryId: 'c1', categoryIds: [], productIds: [] }
    expect(isInScope(s, prod('p1', 'c1'))).toBe(true)
    expect(isInScope(s, prod('p2', 'c2'))).toBe(false)
  })

  it('ติ๊ก product อย่างเดียว ยิงรุ่นนั้นผ่านแม้ category ไม่ถูกติ๊ก', () => {
    const s = { categoryId: null, categoryIds: [], productIds: ['p1'] }
    expect(isInScope(s, prod('p1', 'c9'))).toBe(true)
    expect(isInScope(s, prod('p2', 'c9'))).toBe(false)
  })

  it('ติ๊ก category อย่างเดียว ยิงรุ่นไหนในประเภทนั้นก็ผ่าน', () => {
    const s = { categoryId: null, categoryIds: ['c1'], productIds: [] }
    expect(isInScope(s, prod('p1', 'c1'))).toBe(true)
    expect(isInScope(s, prod('p2', 'c2'))).toBe(false)
  })

  it('คละทั้งสองแบบ = union', () => {
    const s = { categoryId: null, categoryIds: ['c1'], productIds: ['p9'] }
    expect(isInScope(s, prod('p1', 'c1'))).toBe(true)
    expect(isInScope(s, prod('p9', 'c9'))).toBe(true)
    expect(isInScope(s, prod('p2', 'c2'))).toBe(false)
  })
})
