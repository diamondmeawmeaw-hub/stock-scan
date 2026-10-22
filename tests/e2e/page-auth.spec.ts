import { ACCOUNTS, expect, loginAs, prisma, test } from './fixtures'

test.describe('สิทธิ์หน้าเว็บอ่านจากฐานข้อมูลทุกครั้ง', () => {
  test('ปิดใช้งานบัญชีระหว่างใช้งาน -> หลุดไปหน้า login ทันที', async ({ page, data: _data }) => {
    await loginAs(page, 'staff')

    await prisma.user.update({
      where: { username: ACCOUNTS.staff.username },
      data: { active: false },
    })

    await page.goto('/products')
    await expect(page).toHaveURL(/\/login\?reauth=1$/)
    await expect(page.getByTestId('login-form')).toBeVisible()
  })

  test('ลดสิทธิ์แอดมินระหว่างใช้งาน -> เข้าหน้าจัดการผู้ใช้ไม่ได้ทันที', async ({
    page,
    data: _data,
  }) => {
    await loginAs(page, 'admin')

    await prisma.user.update({
      where: { username: ACCOUNTS.admin.username },
      data: { role: 'STAFF' },
    })

    await page.goto('/users')
    await expect(page).toHaveURL(/\/$/)
  })
})
