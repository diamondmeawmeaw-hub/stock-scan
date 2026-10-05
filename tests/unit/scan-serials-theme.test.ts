import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// หน้าค้นหา Serial เน้นอ่านง่าย: hero โทนเดียวกับหน้าสแกน, หัวตารางฟ้า, ผลเป็น badge ไม่ตัดคำ
const src = readFileSync(
  path.resolve(__dirname, '../../src/app/(app)/serials/page.tsx'),
  'utf8'
)

describe('serials page readability', () => {
  it('hero ใช้ scan-hero', () => {
    expect(src).toContain('scan-hero')
  })
  it('หัวตารางใช้พื้นฟ้า', () => {
    expect(src).toContain('<thead className="bg-sky-50')
  })
  it('คอลัมน์ผลไม่ตัดคำแนวตั้ง', () => {
    expect(src).toMatch(/whitespace-nowrap[^>]*result-badge|result-badge/)
  })
})
