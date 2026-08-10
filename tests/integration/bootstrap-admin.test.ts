/**
 * bootstrap-admin.ts สร้างผู้ดูแลระบบคนแรกตอน deploy เครื่องใหม่
 * เทสด้วยการรันเป็น subprocess จริง เพราะสิ่งที่ต้องยืนยันคือพฤติกรรมตอน container start
 * (exit code สำคัญ - entrypoint.sh ใช้ set -e หยุดถ้าสคริปต์ล้ม)
 */
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { beforeEach, describe, expect, it } from 'vitest'
import { verifyPassword } from '@/lib/auth'
import { prisma } from './helpers'

const execFileAsync = promisify(execFile)
const SCRIPT = path.resolve(process.cwd(), 'prisma/bootstrap-admin.ts')

async function runBootstrap(env: Record<string, string | undefined>) {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), SCRIPT],
      {
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL,
          ADMIN_USERNAME: undefined,
          ADMIN_PASSWORD: undefined,
          ADMIN_DISPLAY_NAME: undefined,
          ...env,
        } as NodeJS.ProcessEnv,
      }
    )
    return { code: 0, output: stdout }
  } catch (err: any) {
    return { code: err.code ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

describe('bootstrap-admin (สร้าง admin คนแรกตอน deploy)', () => {
  beforeEach(async () => {
    expect(await prisma.user.count()).toBe(0) // setup.ts ล้างตารางให้แล้ว
  })

  it('ฐานว่าง + ตั้ง ADMIN_PASSWORD -> สร้าง admin ที่ login ได้จริง', async () => {
    const result = await runBootstrap({ ADMIN_PASSWORD: 'ตั้งรหัสเองนะ-123' })
    expect(result.code).toBe(0)

    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } })
    expect(admin.role).toBe('ADMIN')
    expect(admin.active).toBe(true)
    // ต้องเป็น hash ไม่ใช่รหัสดิบ และ verify ผ่าน
    expect(admin.passwordHash).not.toContain('ตั้งรหัสเองนะ-123')
    expect(await verifyPassword('ตั้งรหัสเองนะ-123', admin.passwordHash)).toBe(true)
  })

  it('ฐานว่าง + ไม่ตั้ง ADMIN_PASSWORD -> ล้มด้วย exit code ไม่ใช่ 0 และไม่สร้าง user', async () => {
    const result = await runBootstrap({})
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('ADMIN_PASSWORD')
    expect(await prisma.user.count()).toBe(0)
  })

  it('รหัสสั้นกว่า 8 ตัว -> ปฏิเสธ ไม่ปล่อยรหัสอ่อนขึ้นเครื่องจริง', async () => {
    const result = await runBootstrap({ ADMIN_PASSWORD: 'sh0rt' })
    expect(result.code).not.toBe(0)
    expect(await prisma.user.count()).toBe(0)
  })

  it('มี user อยู่แล้ว -> ข้าม ไม่รีเซ็ตรหัสของคนที่มีอยู่', async () => {
    await runBootstrap({ ADMIN_PASSWORD: 'รหัสเดิม-abc123' })
    const before = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } })

    const result = await runBootstrap({ ADMIN_PASSWORD: 'รหัสใหม่-xyz789' })
    expect(result.code).toBe(0)
    expect(result.output).toContain('ข้ามการสร้าง')

    const after = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } })
    expect(after.passwordHash).toBe(before.passwordHash)
    expect(await prisma.user.count()).toBe(1)
  })

  it('ตั้งชื่อผู้ใช้เองได้ และถูกแปลงเป็นตัวพิมพ์เล็กเหมือนตอน login', async () => {
    const result = await runBootstrap({
      ADMIN_USERNAME: '  BossNoi  ',
      ADMIN_PASSWORD: 'ตั้งรหัสเองนะ-123',
      ADMIN_DISPLAY_NAME: 'หัวหน้าน้อย',
    })
    expect(result.code).toBe(0)

    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'bossnoi' } })
    expect(admin.displayName).toBe('หัวหน้าน้อย')
  })
})
