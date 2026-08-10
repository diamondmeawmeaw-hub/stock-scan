import { ACCOUNTS, expect, loginAs, logout, prisma, test } from './fixtures'

const NEW_USER = { username: 'e2e_somchai', displayName: 'สมชาย', password: 'somchai123' }

function userRow(page: import('@playwright/test').Page, username: string) {
  return page.locator('tbody tr').filter({ hasText: username })
}

/** ช่องสถานะของแถว - ต้องเจาะจงคอลัมน์ ไม่งั้นจะไปตรงกับตัวหนังสือบนปุ่ม "ปิดใช้งาน" */
function statusCell(page: import('@playwright/test').Page, username: string) {
  return userRow(page, username).locator('td').nth(3)
}

test.describe('จัดการผู้ใช้', () => {
  test('staff เข้าหน้าผู้ใช้ไม่ได้ - ไม่มีเมนู และเปิดตรงๆ ก็เด้งกลับหน้าหลัก', async ({
    page,
    data: _data,
  }) => {
    await loginAs(page, 'staff')
    await page.getByTestId('manage-menu').click()
    await expect(page.getByRole('menuitem', { name: 'ผู้ใช้' })).toHaveCount(0)

    await page.goto('/users')
    await expect(page).toHaveURL('/')
  })

  test('admin เพิ่มผู้ใช้ใหม่ แล้วผู้ใช้นั้น login เข้าใช้งานได้จริง', async ({
    page,
    data: _data,
  }) => {
    await loginAs(page, 'admin')
    await page.getByTestId('manage-menu').click()
    await page.getByRole('menuitem', { name: 'ผู้ใช้' }).click()
    await expect(page).toHaveURL('/users')

    await page.locator('#username').fill(NEW_USER.username)
    await page.locator('#displayName').fill(NEW_USER.displayName)
    await page.locator('#password').fill(NEW_USER.password)
    await page.locator('#role').selectOption('STAFF')
    await page.getByRole('button', { name: 'เพิ่มผู้ใช้' }).click()

    await expect(userRow(page, NEW_USER.username)).toBeVisible()
    await expect(userRow(page, NEW_USER.username)).toContainText('พนักงาน')

    await logout(page)
    await page.locator('#username').fill(NEW_USER.username)
    await page.locator('#password').fill(NEW_USER.password)
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByText(NEW_USER.displayName)).toBeVisible()
  })

  test('แก้ชื่อที่แสดงและเลื่อนพนักงานเป็นผู้ดูแล', async ({ page, data: _data }) => {
    await loginAs(page, 'admin')
    await page.goto('/users')

    const row = userRow(page, ACCOUNTS.staff.username)
    await row.getByRole('button', { name: 'แก้ไข' }).click()
    await row.locator('input').fill('พนักงานคนเก่ง')
    await row.locator('select').selectOption('ADMIN')
    await row.getByRole('button', { name: 'บันทึก' }).click()

    const updated = userRow(page, ACCOUNTS.staff.username)
    await expect(updated).toContainText('พนักงานคนเก่ง')
    await expect(updated).toContainText('ผู้ดูแล')
  })

  test('ตั้งรหัสผ่านใหม่ -> รหัสเดิมใช้ไม่ได้ ต้องใช้รหัสใหม่', async ({ page, data: _data }) => {
    await loginAs(page, 'admin')
    await page.goto('/users')

    await userRow(page, ACCOUNTS.staff.username)
      .getByRole('button', { name: 'ตั้งรหัสใหม่' })
      .click()

    // ตั้งรหัสให้คนอื่น ผู้ดูแลไม่รู้รหัสเดิมของเขา จึงไม่ต้องมีช่องนั้น
    const dialog = page.getByTestId('password-dialog')
    await expect(dialog.getByTestId('current-password')).toHaveCount(0)

    const patched = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().includes('/api/users/')
    )
    await dialog.getByTestId('new-password').fill('newpass123')
    await dialog.getByTestId('confirm-password').fill('newpass123')
    await dialog.getByTestId('password-submit').click()
    await patched
    await expect(dialog).toHaveCount(0)

    await logout(page)
    await page.locator('#username').fill(ACCOUNTS.staff.username)
    await page.locator('#password').fill(ACCOUNTS.staff.password)
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
    await expect(page.getByTestId('login-form').getByRole('alert')).toHaveText(
      'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
    )

    await page.locator('#password').fill('newpass123')
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
    await expect(page).toHaveURL('/')
  })

  test('เปลี่ยนรหัสตัวเอง -> ต้องกรอกรหัสเดิม กรอกผิดไม่ผ่าน กรอกถูกใช้รหัสใหม่ login ได้', async ({
    page,
    data: _data,
  }) => {
    await loginAs(page, 'admin')
    await page.goto('/users')

    await userRow(page, ACCOUNTS.admin.username)
      .getByRole('button', { name: 'ตั้งรหัสใหม่' })
      .click()

    const dialog = page.getByTestId('password-dialog')
    await dialog.getByTestId('new-password').fill('bosspass123')
    await dialog.getByTestId('confirm-password').fill('bosspass123')

    // รหัสเดิมผิด -> เด้ง error และกล่องยังเปิดอยู่
    await dialog.getByTestId('current-password').fill('ผิดแน่นอน')
    await dialog.getByTestId('password-submit').click()
    await expect(dialog.getByTestId('password-error')).toHaveText('รหัสผ่านเดิมไม่ถูกต้อง')

    await dialog.getByTestId('current-password').fill(ACCOUNTS.admin.password)
    await dialog.getByTestId('password-submit').click()
    await expect(dialog).toHaveCount(0)

    await logout(page)
    await page.locator('#username').fill(ACCOUNTS.admin.username)
    await page.locator('#password').fill('bosspass123')
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
    await expect(page).toHaveURL('/')
  })

  test('ช่องยืนยันรหัสใหม่ไม่ตรงกัน -> ไม่ยิง API', async ({ page, data: _data }) => {
    await loginAs(page, 'admin')
    await page.goto('/users')

    await userRow(page, ACCOUNTS.staff.username)
      .getByRole('button', { name: 'ตั้งรหัสใหม่' })
      .click()

    const dialog = page.getByTestId('password-dialog')
    await dialog.getByTestId('new-password').fill('newpass123')
    await dialog.getByTestId('confirm-password').fill('newpass999')
    await dialog.getByTestId('password-submit').click()

    await expect(dialog.getByTestId('password-error')).toHaveText('รหัสใหม่กับช่องยืนยันไม่ตรงกัน')

    await dialog.getByRole('button', { name: 'ยกเลิก' }).click()
    await expect(dialog).toHaveCount(0)

    // รหัสเดิมของ staff ต้องยังใช้ได้อยู่
    await logout(page)
    await loginAs(page, 'staff')
    await expect(page).toHaveURL('/')
  })

  test('บัญชีตัวเองไม่มีปุ่มลบและปุ่มปิดใช้งาน', async ({ page, data: _data }) => {
    await loginAs(page, 'admin')
    await page.goto('/users')

    const self = userRow(page, ACCOUNTS.admin.username)
    await expect(self).toContainText('คุณ')
    await expect(self.getByRole('button', { name: 'ลบ' })).toHaveCount(0)
    await expect(self.getByRole('button', { name: 'ปิดใช้งาน' })).toHaveCount(0)
  })

  test('ปิดใช้งานพนักงาน -> พนักงานคนนั้น login ไม่ได้อีก', async ({ page, data: _data }) => {
    await loginAs(page, 'admin')
    await page.goto('/users')

    await userRow(page, ACCOUNTS.staff.username)
      .getByRole('button', { name: 'ปิดใช้งาน' })
      .click()
    await expect(statusCell(page, ACCOUNTS.staff.username)).toHaveText('ปิดใช้งาน')

    await logout(page)
    await page.locator('#username').fill(ACCOUNTS.staff.username)
    await page.locator('#password').fill(ACCOUNTS.staff.password)
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
    await expect(page.getByTestId('login-form').getByRole('alert')).toHaveText(
      'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
    )
  })

  test('ลบผู้ใช้ที่ยังไม่มีประวัติได้ แต่คนที่เคยสแกนต้องปิดใช้งานแทน', async ({ page, data }) => {
    await loginAs(page, 'admin')
    await page.goto('/users')

    page.once('dialog', (d) => d.accept())
    await userRow(page, ACCOUNTS.staff.username).getByRole('button', { name: 'ลบ' }).click()
    await expect(userRow(page, ACCOUNTS.staff.username)).toHaveCount(0)

    // สร้างผู้ใช้ที่มีประวัติการสแกนแล้วลองลบ
    const scanner = await prisma.user.create({
      data: {
        username: 'e2e_scanner',
        passwordHash: data.users.staff.passwordHash,
        displayName: 'คนเคยสแกน',
        role: 'STAFF',
      },
    })
    await prisma.scanLog.create({
      data: {
        serial: 'NB-0001',
        type: 'IN',
        result: 'CREATED',
        accepted: true,
        userId: scanner.id,
      },
    })

    await page.reload()
    page.once('dialog', (d) => d.accept())
    await userRow(page, scanner.username).getByRole('button', { name: 'ลบ' }).click()

    await expect(page.getByText(/ลบไม่ได้/)).toBeVisible()
    await expect(userRow(page, scanner.username)).toBeVisible()

    await userRow(page, scanner.username).getByRole('button', { name: 'ปิดใช้งาน' }).click()
    await expect(statusCell(page, scanner.username)).toHaveText('ปิดใช้งาน')
  })
})
