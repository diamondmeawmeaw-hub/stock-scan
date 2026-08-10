import { expect, loginAs, scanBurst, test } from './fixtures'

test.describe('รายงาน', () => {
  test('กรองยอดคงเหลือตามประเภทของ แบรนด์ และค้นหาชื่อ', async ({ page, data }) => {
    expect(data.products.notebook.brand).toBe('Dell')
    await loginAs(page, 'staff')
    await page.goto('/reports')

    // ยังไม่กรอง = เห็นทั้ง 2 ประเภท (โน๊ตบุ๊ค 3 + จอ 2 + สว่าน 1)
    await expect(page.getByTestId('report-category')).toHaveCount(2)
    await expect(page.getByTestId('grand-total')).toHaveText('6')

    await page.getByTestId('filter-brand').selectOption('Makita')
    await page.getByTestId('apply-filters').click()
    await expect(page.getByTestId('report-category')).toHaveCount(1)
    await expect(page.getByTestId('grand-total')).toHaveText('1')
    await expect(page.getByRole('heading', { name: 'เครื่องมือช่าง (TOOL)' })).toBeVisible()

    await page.getByTestId('clear-filters').click()
    await expect(page.getByTestId('grand-total')).toHaveText('6')

    // ค้นหาแบรนด์เจอสินค้า 2 ตัวที่อยู่ในประเภทเดียวกัน
    await page.getByTestId('filter-q').fill('dell')
    await page.getByTestId('apply-filters').click()
    await expect(page.getByTestId('report-category')).toHaveCount(1)
    await expect(page.getByTestId('grand-total')).toHaveText('5')

    // ค้นหาที่ไม่เจอ -> ขึ้นข้อความว่าง ไม่ใช่ตารางเปล่า
    await page.getByTestId('filter-q').fill('ไม่มีของนี้จริงๆ')
    await page.getByTestId('apply-filters').click()
    await expect(page.getByTestId('stock-empty')).toBeVisible()
  })

  test('ดูความเคลื่อนไหวของวันนี้หลังยิงรับเข้า', async ({ page, data }) => {
    await loginAs(page, 'staff')
    await page.goto('/scan-in')
    await page.getByTestId('product-select').selectOption(data.products.notebook.id)
    await scanBurst(page, ['NEW-0001', 'NEW-0002'])
    await expect(page.getByTestId('scan-pending')).toHaveCount(0)

    await page.goto('/reports')
    await page.getByTestId('tab-movement').click()

    await expect(page.getByTestId('total-in')).toHaveText('2')
    await expect(page.getByTestId('total-out')).toHaveText('0')
    await expect(page.getByTestId('movement-row')).toHaveCount(1)
    await expect(page.getByTestId('movement-row')).toContainText('IT-NB-001')

    // เลือกช่วงวันที่ในอดีตที่ไม่มีการยิง -> ต้องว่าง
    await page.getByTestId('filter-from').fill('2026-01-01')
    await page.getByTestId('filter-to').fill('2026-01-31')
    await page.getByTestId('apply-filters').click()
    await expect(page.getByTestId('movement-empty')).toBeVisible()
  })

  test('โหลดไฟล์ Excel และ PDF ได้ทั้งสองแท็บ', async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/reports')

    const [xlsx] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-xlsx').click(),
    ])
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/)

    await page.getByTestId('tab-movement').click()
    await expect(page.getByTestId('total-in')).toBeVisible()

    const [pdf] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-pdf').click(),
    ])
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/)
  })
})
