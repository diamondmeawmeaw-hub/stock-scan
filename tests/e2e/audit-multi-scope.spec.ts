import { expect, loginAs, scanBurst, test } from './fixtures'

test.describe('ตรวจนับคละรุ่น/คละอุปกรณ์', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/audit')
  })

  test('ติ๊ก 1 ประเภท + 1 รุ่น เปิดรอบ ยิงใน scope ผ่าน นอก scope โดนปฏิเสธ', async ({
    page,
  }) => {
    await page.getByTestId('audit-name').fill('รอบคละ e2e')
    await page.getByTestId('audit-mode-custom').click()
    await page.getByTestId('scope-category').filter({ hasText: 'เครื่องมือช่าง' }).locator('input').check()
    await page.getByTestId('scope-product').filter({ hasText: 'โน๊ตบุ๊ค' }).locator('input').check()
    await page.getByTestId('start-audit').click()
    await page.waitForURL(/\/audit\/.+/)

    // NB-0001 ผ่านทาง product ที่ติ๊กไว้
    await scanBurst(page, ['NB-0001'])
    await expect(page.getByTestId('scan-last')).toHaveAttribute('data-accepted', 'true')
    // MON-0001 อยู่หมวดไอทีที่ไม่ได้ติ๊ก -> นอก scope
    await scanBurst(page, ['MON-0001'])
    await expect(page.getByTestId('scan-last')).toHaveAttribute('data-accepted', 'false')
  })
})
