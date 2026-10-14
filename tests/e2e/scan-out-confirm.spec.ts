import {
  confirmScan,
  expect,
  loginAs,
  scanBurst,
  scanFeedRows,
  STOCK,
  test,
  unitBySerial,
} from './fixtures'

test.describe('เบิกออกต้องยืนยันก่อน (scan-out confirm)', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/scan-out')
  })

  test('ยิงแล้วยังไม่ออกจนกว่าจะกดยืนยัน', async ({ page }) => {
    const serial = STOCK.notebook[0]
    await scanBurst(page, [serial])
    await expect(page.getByTestId('scan-pending')).toHaveCount(0)

    // ยังไม่กดยืนยัน = ของยังค้างในคลัง
    expect((await unitBySerial(serial))?.status).toBe('IN_STOCK')
    await expect(page.getByTestId('confirm-scan')).toBeVisible()

    await confirmScan(page)
    // รอแถวค้างหาย = POST ยืนยันตอบกลับมาแล้ว (กัน dev compile route ครั้งแรกช้า)
    await expect(scanFeedRows(page)).toHaveCount(0)
    expect((await unitBySerial(serial))?.status).toBe('OUT')
  })

  test('ลบออกจากคิวก่อนยืนยัน -> ของไม่ถูกเบิก', async ({ page }) => {
    const serial = STOCK.notebook[1]
    await scanBurst(page, [serial])
    await expect(page.getByTestId('scan-pending')).toHaveCount(0)

    await page.locator('[data-testid="scan-feed"] tbody tr').first().getByRole('button').click()
    await expect(page.locator('[data-testid="scan-feed"] tbody tr')).toHaveCount(0)
    expect((await unitBySerial(serial))?.status).toBe('IN_STOCK')
  })
})
