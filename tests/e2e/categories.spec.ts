import { expect, loginAs, prisma, test } from './fixtures'

test.describe('ประเภทของ: ตั้งค่าเก็บรูปอุปกรณ์', () => {
  test('admin ต้องกดแก้ไข ติ๊กเก็บรูป แล้วกดบันทึก', async ({ page, data: _data }) => {
    await loginAs(page, 'admin')
    await page.goto('/categories')

    const row = page.getByTestId('category-row').filter({ hasText: 'TOOL' })
    await expect(row).toBeVisible()
    await expect(row.getByTestId('category-photos-TOOL')).toHaveText('ไม่เก็บ')
    // โหมดดูต้องยังไม่มี checkbox ให้ติ๊ก
    await expect(row.getByRole('checkbox')).toHaveCount(0)

    await row.getByRole('button', { name: 'แก้ไข' }).click()
    // แถวแก้ไขมีแต่ input ค่าในช่องไม่นับเป็น text จึงหาด้วย testid ของแถวโดยตรง
    const editRow = page.getByTestId('category-row-edit')
    const checkbox = editRow.getByTestId('category-photos-TOOL')
    await expect(checkbox).not.toBeChecked()

    await checkbox.check()
    // ติ๊กแล้วแต่ยังไม่กดบันทึก ค่าในฐานข้อมูลต้องยังไม่เปลี่ยน
    expect(
      (
        await prisma.category.findUnique({
          where: { code: 'TOOL' },
          select: { photosEnabled: true },
        })
      )?.photosEnabled
    ).toBe(false)

    await editRow.getByRole('button', { name: 'บันทึก' }).click()
    await expect(
      page.getByTestId('category-row').filter({ hasText: 'TOOL' }).getByTestId('category-photos-TOOL')
    ).toHaveText('เก็บรูป')

    expect(
      (
        await prisma.category.findUnique({
          where: { code: 'TOOL' },
          select: { photosEnabled: true },
        })
      )?.photosEnabled
    ).toBe(true)
  })

  test('staff เห็นสถานะได้ แต่แก้ไม่ได้', async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/categories')

    const row = page.getByTestId('category-row').filter({ hasText: 'TOOL' })
    await expect(row.getByTestId('category-photos-TOOL')).toHaveText('ไม่เก็บ')

    await row.getByRole('button', { name: 'แก้ไข' }).click()
    await expect(
      page.getByTestId('category-row-edit').getByTestId('category-photos-TOOL')
    ).toBeDisabled()

    // staff ไม่เห็นตัวเลือกตอนสร้างประเภทใหม่
    await expect(page.getByTestId('category-photos-new')).toHaveCount(0)
  })
})
