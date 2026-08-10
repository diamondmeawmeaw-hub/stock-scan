import { expect, loginAs, prisma, scanBurst, STOCK, test } from './fixtures'

test.describe('ประวัติการสแกนที่หน้าค้นหา serial', () => {
  test('กรองตามประเภท ผู้สแกน และ serial ได้', async ({ page, data }) => {
    await loginAs(page, 'staff')

    // สร้างความเคลื่อนไหวจริงผ่านหน้าเว็บ: รับเข้า 2 ชิ้น แล้วเบิกออก 1 ชิ้น
    await page.goto('/scan-in')
    await page.getByTestId('product-select').selectOption(data.products.notebook.id)
    await scanBurst(page, ['LOG-0001', 'LOG-0002'])
    await expect(page.getByTestId('scan-pending')).toHaveCount(0)

    await page.goto('/scan-out')
    await scanBurst(page, ['LOG-0001'])
    await expect(page.getByTestId('scan-pending')).toHaveCount(0)

    await page.goto('/serials')
    await expect(page.getByTestId('scan-log-row')).toHaveCount(3)

    await page.getByTestId('log-type').selectOption('OUT')
    await page.getByTestId('apply-log-filters').click()
    await expect(page.getByTestId('scan-log-row')).toHaveCount(1)
    await expect(page.getByTestId('scan-log-row')).toContainText('LOG-0001')

    await page.getByTestId('clear-log-filters').click()
    await expect(page.getByTestId('scan-log-row')).toHaveCount(3)

    await page.getByTestId('log-q').fill('LOG-0002')
    await page.getByTestId('apply-log-filters').click()
    await expect(page.getByTestId('scan-log-row')).toHaveCount(1)

    // ผู้สแกนคนอื่นไม่มีรายการเลย
    await page.getByTestId('clear-log-filters').click()
    await page.getByTestId('log-user').selectOption({ label: data.users.staff.displayName })
    await page.getByTestId('apply-log-filters').click()
    await expect(page.getByTestId('scan-log-row')).toHaveCount(3)

    // ช่วงวันในอดีตต้องว่าง
    await page.getByTestId('log-from').fill('2020-01-01')
    await page.getByTestId('log-to').fill('2020-01-31')
    await page.getByTestId('apply-log-filters').click()
    await expect(page.getByTestId('scan-log-empty')).toBeVisible()
  })

  test('มีเกิน 50 รายการ -> แบ่งหน้าและกดถัดไป/ก่อนหน้าได้', async ({ page, data }) => {
    await prisma.scanLog.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        serial: `PAGE-${String(i).padStart(4, '0')}`,
        type: 'IN' as const,
        result: 'CREATED' as const,
        accepted: true,
        userId: data.users.staff.id,
        productId: data.products.notebook.id,
        createdAt: new Date(Date.now() + i * 1000),
      })),
    })

    await loginAs(page, 'staff')
    await page.goto('/serials')

    await expect(page.getByTestId('scan-log-row')).toHaveCount(50)
    await expect(page.getByTestId('scan-log-page')).toHaveText('หน้า 1 / 2')
    await expect(page.getByTestId('scan-log-count')).toContainText('จาก 60 รายการ')
    // ใหม่สุดอยู่บนสุด
    await expect(page.getByTestId('scan-log-row').first()).toContainText('PAGE-0059')

    await page.getByTestId('scan-log-next').click()
    await expect(page.getByTestId('scan-log-page')).toHaveText('หน้า 2 / 2')
    await expect(page.getByTestId('scan-log-row')).toHaveCount(10)
    await expect(page.getByTestId('scan-log-row').first()).toContainText('PAGE-0009')

    await page.getByTestId('scan-log-prev').click()
    await expect(page.getByTestId('scan-log-page')).toHaveText('หน้า 1 / 2')
  })

  test('คลิก serial ในประวัติ -> เปิดรายละเอียดของชิ้นนั้น', async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/scan-out')
    await scanBurst(page, [STOCK.notebook[0]])
    await expect(page.getByTestId('scan-pending')).toHaveCount(0)

    await page.goto('/serials')
    await page.getByTestId('scan-log-row').first().getByRole('link').click()

    await expect(page.getByTestId('serial-value')).toHaveText(STOCK.notebook[0])
    await expect(page.getByTestId('serial-status')).toHaveAttribute('data-status', 'OUT')
  })
})
