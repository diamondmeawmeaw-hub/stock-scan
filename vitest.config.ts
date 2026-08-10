import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))
const alias = { '@': path.resolve(root, 'src') }

export default defineConfig({
  test: {
    // integration test ทุกไฟล์ใช้ฐานข้อมูลเดียวกันและล้างตารางก่อนทุกเคส
    // จึงต้องรันทีละไฟล์ (ตั้งที่ระดับบนสุดเท่านั้น ตั้งใน project ไม่มีผล)
    fileParallelism: false,
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        resolve: {
          alias: {
            ...alias,
            // route handler จริงเรียก cookies() ของ Next ซึ่งใช้ได้เฉพาะใน request จริง
            // จึงสลับเป็นโถคุกกี้ในหน่วยความจำตอนเทส
            'next/headers': path.resolve(root, 'tests/integration/mocks/next-headers.ts'),
          },
        },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/integration/global-setup.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
