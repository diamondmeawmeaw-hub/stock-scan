import { expect, loginAs, selectProduct, test } from './fixtures'

async function createProduct(page: import('@playwright/test').Page, sku: string, name: string) {
  await page.goto('/products')
  const form = page.getByTestId('product-form')
  await form.locator('#sku').fill(sku)
  await form.locator('#name').fill(name)
  await form.getByRole('button', { name: 'เพิ่ม' }).click()
  await expect(page.getByText(sku)).toBeVisible()
}

test.describe('เลือกวิธีรับครั้งแรกตอนรับเข้า (receive-mode)', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
  })

  test('สินค้าใหม่ไร้ประวัติ -> มี tabs เลือกวิธีรับ', async ({ page }) => {
    await createProduct(page, 'BX-DEC-001', 'ของทดสอบวิธีรับ')
    await page.goto('/scan-in')
    await selectProduct(page, 'BX-DEC-001')
    await expect(page.getByTestId('receive-mode')).toBeVisible()
  })

  test('รับแบบจำนวนครั้งแรก (หน่วยกล่อง) -> ครั้งต่อไปไม่มี tabs (ล็อกแล้ว)', async ({
    page,
  }) => {
    await createProduct(page, 'BX-DEC-002', 'ของทดสอบล็อก')
    await page.goto('/scan-in')
    await selectProduct(page, 'BX-DEC-002')

    await page.getByTestId('receive-mode-quantity').click()
    await page.getByTestId('receive-unit').selectOption('กล่อง')
    await page.getByTestId('quantity-input').fill('10')
    await page.getByTestId('quantity-in-form').getByRole('button', { name: 'รับเข้า' }).click()
    await expect(page.getByTestId('quantity-message')).toContainText('รับเข้า')

    // เปิดใหม่ต้องล็อกเป็นนับจำนวนแล้ว ไม่มี tabs ให้สลับ
    await page.reload()
    await selectProduct(page, 'BX-DEC-002')
    await expect(page.getByTestId('receive-mode')).toHaveCount(0)
    await expect(page.getByTestId('quantity-in-form')).toBeVisible()

    // หน้าสินค้าโชว์จำนวน (กล่อง)
    await page.goto('/products')
    await expect(page.getByText('(กล่อง)')).toBeVisible()
  })
})
