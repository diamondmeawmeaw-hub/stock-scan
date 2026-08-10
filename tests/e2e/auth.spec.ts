import { ACCOUNTS, expect, loginAs, logout, test } from './fixtures'

test.describe('เข้าสู่ระบบ', () => {
  test('ยังไม่ login เปิดหน้าอื่นไม่ได้ - เด้งไปหน้า login พร้อมจำหน้าที่ตั้งใจไป', async ({
    page,
    data: _data,
  }) => {
    await page.goto('/scan-in')
    await expect(page).toHaveURL(/\/login\?next=%2Fscan-in$/)
    await expect(page.getByTestId('login-form')).toBeVisible()
  })

  test('รหัสผ่านผิด -> ขึ้นข้อความเตือน และยังเข้าไม่ได้', async ({ page, data: _data }) => {
    await page.goto('/login')
    await page.locator('#username').fill(ACCOUNTS.staff.username)
    await page.locator('#password').fill('ผิดแน่ๆ')
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()

    // เจาะจงในฟอร์ม เพราะ Next มี route announcer ที่เป็น role="alert" อยู่ในหน้าเสมอ
    await expect(page.getByTestId('login-form').getByRole('alert')).toHaveText(
      'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
    )
    await expect(page).toHaveURL(/\/login/)
  })

  test('login สำเร็จ -> เข้าหน้าหลัก เห็นชื่อและสิทธิ์ของตัวเอง', async ({ page, data: _data }) => {
    await loginAs(page, 'staff')

    await expect(page).toHaveURL('/')
    await expect(page.getByText(ACCOUNTS.staff.displayName)).toBeVisible()
    await expect(page.getByText('พนักงาน', { exact: true })).toBeVisible()
  })

  test('login แล้วพากลับไปหน้าที่ตั้งใจจะไปตั้งแต่แรก', async ({ page, data: _data }) => {
    await page.goto('/scan-out')
    await expect(page).toHaveURL(/\/login/)

    await page.locator('#username').fill(ACCOUNTS.staff.username)
    await page.locator('#password').fill(ACCOUNTS.staff.password)
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()

    await expect(page).toHaveURL('/scan-out')
    await expect(page.getByTestId('scan-input')).toBeVisible()
  })

  test('login อยู่แล้วเปิดหน้า login ซ้ำ -> เด้งกลับหน้าหลัก', async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/login')
    await expect(page).toHaveURL('/')
  })

  test('ออกจากระบบแล้วเข้าหน้าอื่นไม่ได้อีก', async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click()
    await expect(page).toHaveURL(/\/login/)

    await page.goto('/reports')
    await expect(page).toHaveURL(/\/login\?next=%2Freports$/)
  })

  test('staff เพิ่ม/ลบสินค้าได้เหมือน admin', async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/products')
    await expect(page.getByText('IT-NB-001')).toBeVisible()
    await expect(page.getByTestId('product-form')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ลบ' }).first()).toBeVisible()

    await logout(page)
    await loginAs(page, 'admin')
    await page.goto('/products')
    await expect(page.getByText('ผู้ดูแล', { exact: true })).toBeVisible()
    await expect(page.getByTestId('product-form')).toBeVisible()
  })
})
