import {
  countInStock,
  expect,
  focusScanner,
  loginAs,
  scanBurst,
  scanFeedRows,
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
    await page.getByTestId('product-select').selectOption(data.products.notebook.id)
    await scanBurst(page, ['NB-9101', 'NB-9102'])

    await focusScanner(page)
    await page.keyboard.press('Control+Enter')

    // บันทึกสำเร็จ รายการค้างหายจากจอ และของเข้าคลังจริง (3 เดิม + 2 ใหม่)
    await expect(scanFeedRows(page)).toHaveCount(0)
    expect(await countInStock(data.products.notebook.id)).toBe(5)
  })
})
