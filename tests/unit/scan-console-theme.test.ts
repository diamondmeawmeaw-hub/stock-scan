import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// เปลี่ยนแค่ classes ห้ามแตะ logic — test นี้ล็อกว่า component ใช้ utilities พาสเทลชุดใหม่
const src = readFileSync(
  path.resolve(__dirname, '../../src/components/ScanConsole.tsx'),
  'utf8'
)

describe('ScanConsole pastel classes', () => {
  it('ช่องสแกนใช้ scan-input', () => {
    expect(src).toMatch(/className="[^"]*scan-input/)
  })
  it('stats ใช้ stat-pop-ok / stat-pop-bad', () => {
    expect(src).toContain('stat-pop-ok')
    expect(src).toContain('stat-pop-bad')
  })
  it('ปุ่มยืนยันใช้ btn-pop-primary', () => {
    expect(src).toContain('btn-pop-primary')
  })
  it('การ์ด feed ใช้ card-pop', () => {
    expect(src).toContain('card-pop')
  })
})
