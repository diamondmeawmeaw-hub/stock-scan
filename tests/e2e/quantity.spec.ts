import { expect, loginAs, prisma, test } from './fixtures'

test.describe('สินค้านับจำนวน (quantity)', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
  })

  test('สร้างสินค้าแบบจำนวน -> รับเข้าแบบกรอก -> เบิกออกแบบกรอก (ของหมดกดไม่ได้)', async ({
    page,
  }) => {
    // 1) สร้างสินค้าแบบนับจำนวนที่หน้าสินค้า
    await page.goto('/products')
    await page.locator('#sku').fill('RK-E2E-9U')
    await page.locator('#name').fill('ตู้แร็ค E2E')
    await page.locator('#tracking').selectOption('QUANTITY')
    await page.locator('#unit').fill('ตู้')
    await page.getByRole('button', { name: 'เพิ่ม' }).click()
    await expect(page.getByText('RK-E2E-9U')).toBeVisible()

    const product = await prisma.product.findUniqueOrThrow({ where: { sku: 'RK-E2E-9U' } })
    expect(product.trackingType).toBe('QUANTITY')

    // 2) รับเข้า 5 ตู้
    await page.goto('/scan-in')
    await page.getByTestId('product-select').selectOption(product.id)
    await page.getByTestId('quantity-input').fill('5')
    await page.getByTestId('quantity-in-form').getByRole('button', { name: 'รับเข้า' }).click()
    await expect(page.getByTestId('quantity-message')).toContainText('คงเหลือ 5')
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQty).toBe(5)

    // 3) เบิกออก 2 ตู้ (แท็บกรอกจำนวน)
    await page.goto('/scan-out')
    await page.getByTestId('mode-quantity').click()
    await page.getByTestId('quantity-product-select').selectOption(product.id)
    await page.getByTestId('quantity-input').fill('2')
    await page.getByTestId('quantity-out-form').getByRole('button', { name: 'เบิกออก' }).click()
    await expect(page.getByTestId('quantity-message')).toContainText('คงเหลือ 3')
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQty).toBe(3)

    // 4) กรอกเกินยอด -> ช่องกรอกจำกัด max เท่าที่มี (browser กันไว้ชั้นแรก,
    //    server กันซ้ำอีกชั้นด้วย 400 - ครอบคลุมใน integration test แล้ว)
    await expect(page.getByTestId('quantity-input')).toHaveAttribute('max', '3')

    // 5) เบิกที่เหลือจนหมด -> ตัวเลือกขึ้นว่าหมดและกดไม่ได้
    await page.getByTestId('quantity-input').fill('3')
    await page.getByTestId('quantity-out-form').getByRole('button', { name: 'เบิกออก' }).click()
    await expect(page.getByTestId('quantity-message')).toContainText('คงเหลือ 0')
    const option = page
      .getByTestId('quantity-product-select')
      .locator(`option[value="${product.id}"]`)
    await expect(option).toBeDisabled()
  })
})
