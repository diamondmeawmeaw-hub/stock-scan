import {
  confirmScan,
  countInStock,
  expect,
  focusScanner,
  loginAs,
  scanBurst,
  scanFeedRows,
  selectProduct,
  test,
} from './fixtures'

test.describe('ยืนยันรับเข้า (confirm)', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/scan-in')
  })

  test('ยิงแล้วกด Ctrl+Enter -> ยืนยันบันทึก ของเข้าคลังโดยไม่ต้องจับเมาส์', async ({
    data,
    page,
  }) => {
    await selectProduct(page, 'IT-NB')
    await scanBurst(page, ['NB-9101', 'NB-9102'])

    await focusScanner(page)
    await page.keyboard.press('Control+Enter')

    // บันทึกสำเร็จ รายการค้างหายจากจอ และของเข้าคลังจริง (3 เดิม + 2 ใหม่)
    await expect(scanFeedRows(page)).toHaveCount(0)
    expect(await countInStock(data.products.notebook.id)).toBe(5)
  })

  test('ยืนยันแล้วแถว fail (ยิงซ้ำของในคลัง) -> ยังมีปุ่มลบ ไม่ต้องรีเฟรช', async ({
    data,
    page,
  }) => {
    await selectProduct(page, 'IT-NB')
    // NB-0001 มีในคลังอยู่แล้ว ยืนยันแล้วจะ fail ค้างเป็นแถวแดง
    await scanBurst(page, ['NB-0001'])
    await confirmScan(page)
    await expect(scanFeedRows(page)).toHaveCount(1)
    await expect(page.getByTestId('scan-last')).toContainText('ยิงซ้ำ')

    const del = scanFeedRows(page).first().getByRole('button')
    await expect(del).toBeVisible()
    await del.click()
    await expect(scanFeedRows(page)).toHaveCount(0)
    // ของในคลังเท่าเดิม ไม่มีการบันทึกเพิ่ม
    expect(await countInStock(data.products.notebook.id)).toBe(3)
  })
})
