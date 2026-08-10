import { defineConfig, devices } from '@playwright/test'
import { E2E_AUTH_SECRET, E2E_BASE_URL, E2E_DATABASE_URL, E2E_HOST, E2E_PORT } from './tests/e2e/env'

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  // ทุกเทสใช้ฐานข้อมูลเดียวกันและล้างตารางก่อนทุกเคส จึงต้องรันทีละเคส
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: E2E_BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
  },

  globalSetup: './tests/e2e/global-setup.ts',

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // ยิงเข้าเว็บที่ build แล้วจะใกล้ของจริงกว่า แต่ dev server เร็วกว่ามากตอนเขียนเทส
    // ตั้ง E2E_BUILD=1 เพื่อเทสกับ production build
    command: process.env.E2E_BUILD
      ? `npm run build && npx next start --port ${E2E_PORT} --hostname ${E2E_HOST}`
      : `npx next dev --port ${E2E_PORT} --hostname ${E2E_HOST}`,
    url: E2E_BASE_URL,
    // ต้องเปิดเซิร์ฟเวอร์เอง เพราะตัวที่รันอยู่แล้วอาจชี้ไปฐานข้อมูลใช้งานจริง
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      // ค่าที่ตั้งใน process.env ชนะค่าในไฟล์ .env เสมอ (Next ไม่เขียนทับของเดิม)
      // เว็บเซิร์ฟเวอร์ตัวนี้จึงต่อฐาน e2e ไม่ใช่ฐานใช้งานจริง
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET: E2E_AUTH_SECRET,
      NEXT_TELEMETRY_DISABLED: '1',
      // build ลง .next-e2e เพื่อไม่ให้ชนกับ npm run dev ที่เปิดค้างไว้
      // (ใช้โฟลเดอร์เดียวกันแล้วสองตัวจะเขียนทับ chunk กันจนหน้าเว็บพัง)
      NEXT_DIST_DIR: '.next-e2e',
    },
  },
})
