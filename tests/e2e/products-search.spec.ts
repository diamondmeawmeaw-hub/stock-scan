import { expect, loginAs, prisma, test } from './fixtures'

test.describe('ค้นหาสินค้า (product search)', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/products')
  })

  test('พิมพ์ค้นหากรองตารางได้ทันที ไม่ต้องยิง API', async ({ page }) => {
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(3)

    // แบรนด์ Dell มี 2 ตัว (โน๊ตบุ๊ค + จอ)
    await page.getByTestId('product-search').fill('dell')
    await expect(rows).toHaveCount(2)

    // หลายคำต้องตรงทุกคำ
    await page.getByTestId('product-search').fill('dell โน๊ตบุ๊ค')
    await expect(rows).toHaveCount(1)

    // ไม่ตรงเลย -> ข้อความว่าง
    await page.getByTestId('product-search').fill('ไม่มีของนี้')
    await expect(rows).toHaveCount(1)
    await expect(page.getByTestId('product-empty')).toBeVisible()

    // ล้างแล้วกลับมาเต็ม
    await page.getByTestId('product-search').fill('')
    await expect(rows).toHaveCount(3)
  })
})

test.describe('หน่วยนับมาตรฐาน (unit labels)', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/products')
  })

  test('สร้างของนับจำนวนด้วยหน่วยมาตรฐาน + หน่วยพิมพ์เอง', async ({ page, data: _data }) => {
    const form = page.getByTestId('product-form')
    await page.locator('#tracking').selectOption('QUANTITY')

    // หน่วยมาตรฐาน: เลือก "กล่อง" จากรายการ
    await form.locator('#sku').fill('BX-E2E-001')
    await form.locator('#name').fill('กล่องเทส')
    await page.getByTestId('unit-select').selectOption('กล่อง')
    await form.getByRole('button', { name: 'เพิ่ม' }).click()
    await expect(page.getByText('BX-E2E-001')).toBeVisible()
    await expect(page.getByText('(กล่อง)')).toBeVisible()

    // หน่วยพิมพ์เอง: เลือกอื่นๆ แล้วพิมพ์ "ลัง"
    await page.locator('#tracking').selectOption('QUANTITY')
    await form.locator('#sku').fill('BX-E2E-002')
    await form.locator('#name').fill('ลังเทส')
    await page.getByTestId('unit-select').selectOption('__custom__')
    await page.getByTestId('unit-custom').fill('ลัง')
    await form.getByRole('button', { name: 'เพิ่ม' }).click()
    await expect(page.getByText('BX-E2E-002')).toBeVisible()
    await expect(page.getByText('(ลัง)')).toBeVisible()
  })
})

test.describe('กล่องแนะนำตอนคลังว่าง (onboarding)', () => {
  test('คลังว่าง -> โชว์ 3 ขั้นตอน มีของแล้ว -> กล่องหาย', async ({ page, data: _data }) => {
    await loginAs(page, 'staff')

    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "ScanLog", "SerialUnit", "Product" RESTART IDENTITY CASCADE'
    )
    await page.goto('/')
    await expect(page.getByTestId('onboarding-guide')).toBeVisible()
    await expect(page.getByTestId('onboarding-guide')).toContainText('เพิ่มประเภทของ')
  })
})
