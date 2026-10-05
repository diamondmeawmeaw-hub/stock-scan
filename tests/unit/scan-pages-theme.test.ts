import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function srcOf(file: string) {
  return readFileSync(path.resolve(__dirname, '../../', file), 'utf8')
}

// hero พาสเทลครอบหัวข้อระดับหน้า (h1 ของ scan-in/out อยู่ page.tsx, ของ audit อยู่ใน Client)
const heroFiles = [
  'src/app/(app)/scan-in/page.tsx',
  'src/app/(app)/scan-out/page.tsx',
  'src/app/(app)/audit/[id]/AuditSessionClient.tsx',
]

// ฟอร์ม/การ์ดใน Client ใช้ card-pop
const cardFiles = [
  'src/app/(app)/scan-in/ScanInClient.tsx',
  'src/app/(app)/scan-out/ScanOutClient.tsx',
  'src/app/(app)/audit/[id]/AuditSessionClient.tsx',
]

describe('scan pages hero', () => {
  for (const file of heroFiles) {
    it(`${file} ใช้ scan-hero`, () => {
      expect(srcOf(file)).toContain('scan-hero')
    })
  }
  for (const file of cardFiles) {
    it(`${file} ใช้ card-pop`, () => {
      expect(srcOf(file)).toContain('card-pop')
    })
  }
})
