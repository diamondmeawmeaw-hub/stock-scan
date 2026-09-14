import {
  expect,
  loginAs,
  scanBurst,
  STOCK,
  test,
  unitBySerial,
} from './fixtures'

test.describe('คืนของที่เบิกผิด (return)', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
  })

  test('เบิกออกแล้วกดคืนของในหน้าประวัติ -> กลับ IN_STOCK', async ({ page }) => {
    const serial = STOCK.notebook[0]

    // 1) เบิกออกผ่านหน้าเว็บ (scan-out ยิงแล้วเข้าคลังทันที ไม่มี confirm)
    await page.goto('/scan-out')
    await scanBurst(page, [serial])
    await expect(page.getByTestId('scan-last')).toContainText('เบิกออก')
    expect((await unitBySerial(serial))?.status).toBe('OUT')

    // 2) เปิดประวัติของชิ้นนี้แล้วกดคืน
    await page.goto(`/serials?serial=${encodeURIComponent(serial)}`)
    await expect(page.getByTestId('serial-status')).toHaveAttribute('data-status', 'OUT')

    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'คืนของ' }).first().click()

    // 3) คืนแล้ว: สถานะกลับเข้าคลัง + ขึ้นป้ายคืนแล้ว
    await expect(page.getByTestId('serial-status')).toHaveAttribute('data-status', 'IN_STOCK')
    await expect(page.getByText('คืนแล้ว').first()).toBeVisible()
    expect((await unitBySerial(serial))?.status).toBe('IN_STOCK')
  })
})

test.describe('ลบรอบตรวจนับที่เปิดผิด (audit delete)', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/audit')
  })

  test('รอบว่างที่เพิ่งเปิด -> ลบได้ กลับไปหน้ารายการ', async ({ page }) => {
    await page.getByTestId('audit-name').fill('เปิดผิดรอบ')
    await page.getByTestId('start-audit').click()
    await page.waitForURL(/\/audit\/.+/)

    await expect(page.getByTestId('audit-progress')).toBeVisible()
    await expect(page.getByTestId('audit-progress-text')).toContainText('นับแล้ว 0 จาก')

    page.once('dialog', (d) => void d.accept())
    await page.getByTestId('delete-audit').click()

    await page.waitForURL('/audit')
    await expect(page.getByTestId('new-audit-form')).toBeVisible()
  })

  test('รอบที่เริ่มนับแล้ว -> ปุ่มลบหาย กันลบหลักฐาน', async ({ page }) => {
    await page.getByTestId('audit-name').fill('รอบนี้ห้ามลบ')
    await page.getByTestId('start-audit').click()
    await page.waitForURL(/\/audit\/.+/)

    await scanBurst(page, [STOCK.notebook[0]])
    await expect(page.getByTestId('scan-last')).toBeVisible()

    // รอรีเฟรชผล (debounce 800ms) แล้วปุ่มลบต้องหายไป
    await expect(page.getByTestId('delete-audit')).toHaveCount(0, { timeout: 10000 })
  })
})
