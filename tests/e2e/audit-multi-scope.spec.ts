import { expect, loginAs, scanBurst, test } from './fixtures'

test.describe('ตรวจนับคละรุ่น/คละอุปกรณ์', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/audit')
  })

  test('หยิบ 1 ประเภท + 1 รุ่น เปิดรอบ ยิงใน scope ผ่าน นอก scope โดนปฏิเสธ', async ({
    page,
    data,
  }) => {
    await page.getByTestId('audit-name').fill('รอบคละ e2e')
    await page.getByTestId('audit-mode-custom').click()

    // หยิบทั้งประเภทเครื่องมือช่าง
    await page.getByTestId('scope-pick-category').selectOption({ label: 'เครื่องมือช่าง' })
    await page.getByTestId('scope-add-category').click()
    await expect(page.getByTestId('scope-picked')).toContainText('เครื่องมือช่าง')

    // หยิบรุ่นโน๊ตบุ๊ค (ต้องเลือกประเภทไอทีก่อนถึงจะเห็นรุ่น)
    await page.getByTestId('scope-pick-category').selectOption({ label: 'อุปกรณ์ไอที' })
    await page.getByTestId('scope-pick-product').selectOption({ label: 'โน๊ตบุ๊ค (IT-NB-001)' })
    await page.getByTestId('scope-add-product').click()
    await expect(page.getByTestId('scope-picked')).toContainText('โน๊ตบุ๊ค')

    // เอารุ่นออกแล้วหยิบใหม่ กันปุ่มลบเสีย
    const prodId = data.products.notebook.id
    await page.getByTestId(`scope-remove-prod-${prodId}`).click()
    await expect(page.getByTestId('scope-picked')).not.toContainText('โน๊ตบุ๊ค')
    await page.getByTestId('scope-pick-product').selectOption({ label: 'โน๊ตบุ๊ค (IT-NB-001)' })
    await page.getByTestId('scope-add-product').click()

    await page.getByTestId('start-audit').click()
    await page.waitForURL(/\/audit\/.+/)

    // NB-0001 ผ่านทางรุ่นที่หยิบไว้
    await scanBurst(page, ['NB-0001'])
    await expect(page.getByTestId('scan-last')).toHaveAttribute('data-accepted', 'true')
    // MON-0001 อยู่หมวดไอทีที่ไม่ได้หยิบ (หยิบแค่รุ่นโน๊ตบุ๊ค) -> นอก scope
    await scanBurst(page, ['MON-0001'])
    await expect(page.getByTestId('scan-last')).toHaveAttribute('data-accepted', 'false')
    // DRL-0001 ผ่านทางประเภทที่หยิบไว้ทั้งหมวด
    await scanBurst(page, ['DRL-0001'])
    await expect(page.getByTestId('scan-last')).toHaveAttribute('data-accepted', 'true')
  })
})
