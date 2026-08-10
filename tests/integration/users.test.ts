import { beforeEach, describe, expect, it } from 'vitest'
import { GET as stockReportRoute } from '@/app/api/reports/stock/route'
import { GET as listUsersRoute, POST as createUserRoute } from '@/app/api/users/route'
import { DELETE as deleteUserRoute, PATCH as updateUserRoute } from '@/app/api/users/[id]/route'
import {
  deleteJson,
  getJson,
  login,
  patchJson,
  postJson,
  prisma,
  seedFixtures,
} from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>

const NEW_USER = {
  username: 'somchai',
  displayName: 'สมชาย',
  password: 'somchai123',
  role: 'STAFF' as const,
}

describe('จัดการผู้ใช้', () => {
  let fx: Fixtures

  beforeEach(async () => {
    fx = await seedFixtures() // login เป็น staff ไว้แล้ว, มี admin 1 คน
  })

  describe('สิทธิ์เข้าถึง', () => {
    it('staff เรียกดูรายชื่อผู้ใช้ไม่ได้ -> 403', async () => {
      expect((await getJson(listUsersRoute)).status).toBe(403)
    })

    it('staff สร้างผู้ใช้ไม่ได้ -> 403 และไม่มีผู้ใช้ใหม่เกิดขึ้น', async () => {
      expect((await postJson(createUserRoute, NEW_USER)).status).toBe(403)
      expect(await prisma.user.count({ where: { username: 'somchai' } })).toBe(0)
    })

    it('ยังไม่ login -> 401', async () => {
      const { __clearCookies } = await import('./mocks/next-headers')
      __clearCookies()
      expect((await getJson(listUsersRoute)).status).toBe(401)
    })
  })

  describe('สร้างผู้ใช้', () => {
    beforeEach(async () => {
      await login('admin', 'admin123')
    })

    it('สร้างแล้ว login ด้วยรหัสใหม่ได้ทันที', async () => {
      const res = await postJson(createUserRoute, NEW_USER)
      expect(res.status).toBe(200)
      expect(res.body.user).toMatchObject({ username: 'somchai', role: 'STAFF', active: true })

      const session = await login('somchai', 'somchai123')
      expect(session.username).toBe('somchai')
    })

    it('ไม่ส่ง passwordHash กลับมาทั้งตอนสร้างและตอนดูรายชื่อ', async () => {
      const created = await postJson(createUserRoute, NEW_USER)
      expect(created.body.user.passwordHash).toBeUndefined()

      const list = await getJson(listUsersRoute)
      expect(list.body.users.every((u: object) => !('passwordHash' in u))).toBe(true)
    })

    it('ชื่อผู้ใช้ถูกทำเป็นตัวพิมพ์เล็กและตัดช่องว่าง', async () => {
      const res = await postJson(createUserRoute, { ...NEW_USER, username: '  SomChai ' })
      expect(res.body.user.username).toBe('somchai')
    })

    it('ชื่อผู้ใช้ซ้ำ -> 409', async () => {
      expect((await postJson(createUserRoute, { ...NEW_USER, username: 'staff' })).status).toBe(409)
    })

    it('รหัสผ่านสั้นเกินไป -> 400', async () => {
      expect((await postJson(createUserRoute, { ...NEW_USER, password: '123' })).status).toBe(400)
    })

    it('ชื่อผู้ใช้มีอักขระต้องห้าม -> 400', async () => {
      expect((await postJson(createUserRoute, { ...NEW_USER, username: 'som chai' })).status).toBe(
        400
      )
    })
  })

  describe('แก้ไขผู้ใช้', () => {
    beforeEach(async () => {
      await login('admin', 'admin123')
    })

    it('แก้ชื่อที่แสดงและเลื่อนเป็นผู้ดูแลได้', async () => {
      const res = await patchJson(
        updateUserRoute,
        { displayName: 'พนักงานคนเก่ง', role: 'ADMIN' },
        { id: fx.user.id }
      )
      expect(res.status).toBe(200)
      expect(res.body.user).toMatchObject({ displayName: 'พนักงานคนเก่ง', role: 'ADMIN' })
    })

    it('ตั้งรหัสผ่านใหม่ให้คนอื่น -> ไม่ต้องกรอกรหัสเดิม รหัสเดิมใช้ไม่ได้ รหัสใหม่ใช้ได้', async () => {
      const res = await patchJson(updateUserRoute, { password: 'newpass123' }, { id: fx.user.id })
      expect(res.status).toBe(200)

      await expect(login('staff', 'staff123')).rejects.toThrow()
      await expect(login('staff', 'newpass123')).resolves.toMatchObject({ username: 'staff' })
    })

    it('เปลี่ยนรหัสตัวเองโดยไม่กรอกรหัสเดิม -> 400 และรหัสไม่เปลี่ยน', async () => {
      const res = await patchJson(updateUserRoute, { password: 'newpass123' }, { id: fx.admin.id })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('รหัสผ่านเดิม')
      await expect(login('admin', 'admin123')).resolves.toMatchObject({ username: 'admin' })
    })

    it('เปลี่ยนรหัสตัวเองด้วยรหัสเดิมที่ผิด -> 400 และรหัสไม่เปลี่ยน', async () => {
      const res = await patchJson(
        updateUserRoute,
        { password: 'newpass123', currentPassword: 'ผิดแน่นอน' },
        { id: fx.admin.id }
      )

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('ไม่ถูกต้อง')
      await expect(login('admin', 'admin123')).resolves.toMatchObject({ username: 'admin' })
    })

    it('เปลี่ยนรหัสตัวเองด้วยรหัสเดิมที่ถูก -> สำเร็จ', async () => {
      const res = await patchJson(
        updateUserRoute,
        { password: 'newpass123', currentPassword: 'admin123' },
        { id: fx.admin.id }
      )

      expect(res.status).toBe(200)
      await expect(login('admin', 'admin123')).rejects.toThrow()
      await expect(login('admin', 'newpass123')).resolves.toMatchObject({ username: 'admin' })
    })

    it('แก้ชื่อตัวเองโดยไม่แตะรหัส -> ไม่ต้องกรอกรหัสเดิม', async () => {
      const res = await patchJson(updateUserRoute, { displayName: 'บอสใหญ่' }, { id: fx.admin.id })
      expect(res.status).toBe(200)
    })

    it('ลดสิทธิ์ตัวเอง -> 400 และสิทธิ์ไม่เปลี่ยน', async () => {
      const res = await patchJson(updateUserRoute, { role: 'STAFF' }, { id: fx.admin.id })
      expect(res.status).toBe(400)
      expect((await prisma.user.findUnique({ where: { id: fx.admin.id } }))!.role).toBe('ADMIN')
    })

    it('ปิดใช้งานตัวเอง -> 400', async () => {
      expect((await patchJson(updateUserRoute, { active: false }, { id: fx.admin.id })).status).toBe(
        400
      )
    })

    it('แก้ชื่อที่แสดงของตัวเองได้ปกติ', async () => {
      const res = await patchJson(updateUserRoute, { displayName: 'บอส' }, { id: fx.admin.id })
      expect(res.status).toBe(200)
      expect(res.body.user.displayName).toBe('บอส')
    })

    it('ผู้ดูแลคนอื่นยังปิดใช้งานผู้ดูแลได้ ตราบใดที่ไม่ใช่บัญชีตัวเอง', async () => {
      await patchJson(updateUserRoute, { role: 'ADMIN' }, { id: fx.user.id })
      await login('staff', 'staff123')

      const res = await patchJson(updateUserRoute, { active: false }, { id: fx.admin.id })
      expect(res.status).toBe(200)
      expect(res.body.user.active).toBe(false)
    })
  })

  describe('ลบผู้ใช้', () => {
    beforeEach(async () => {
      await login('admin', 'admin123')
    })

    it('ลบผู้ใช้ที่ยังไม่มีประวัติได้', async () => {
      const res = await deleteJson(deleteUserRoute, { id: fx.user.id })
      expect(res.status).toBe(200)
      expect(await prisma.user.findUnique({ where: { id: fx.user.id } })).toBeNull()
    })

    it('ผู้ใช้ที่มีประวัติสแกน -> 409 และยังอยู่ในระบบ', async () => {
      await prisma.scanLog.create({
        data: {
          serial: 'NB0001',
          type: 'IN',
          result: 'CREATED',
          accepted: true,
          userId: fx.user.id,
        },
      })

      const res = await deleteJson(deleteUserRoute, { id: fx.user.id })
      expect(res.status).toBe(409)
      expect(res.body.error).toContain('ปิดใช้งาน')
      expect(await prisma.user.findUnique({ where: { id: fx.user.id } })).not.toBeNull()
    })

    it('ลบบัญชีตัวเอง -> 400', async () => {
      const res = await deleteJson(deleteUserRoute, { id: fx.admin.id })
      expect(res.status).toBe(400)
      expect(await prisma.user.findUnique({ where: { id: fx.admin.id } })).not.toBeNull()
    })
  })

  it('ผู้ใช้ที่ถูกปิดใช้งานระหว่างมี session ค้าง -> request ถัดไป 401', async () => {
    // staff login ค้างอยู่จาก seedFixtures
    expect((await getJson(stockReportRoute)).status).toBe(200)
    await prisma.user.update({ where: { id: fx.user.id }, data: { active: false } })
    expect((await getJson(stockReportRoute)).status).toBe(401)
  })
})
