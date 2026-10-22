import {
  confirmScan,
  expect,
  focusScanner,
  loginAs,
  prisma,
  scan,
  scanBurst,
  scanFeedRows,
  STOCK,
  test,
  unitBySerial,
} from './fixtures'

test.describe('เบิกออกต้องยืนยันก่อน (scan-out confirm)', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/scan-out')
  })

  test('ยิงแล้วยังไม่ออกจนกว่าจะกดยืนยัน', async ({ page }) => {
    const serial = STOCK.notebook[0]
    await scanBurst(page, [serial])
    await expect(page.getByTestId('scan-pending')).toHaveCount(0)

    // ยังไม่กดยืนยัน = ของยังค้างในคลัง
    expect((await unitBySerial(serial))?.status).toBe('IN_STOCK')
    await expect(page.getByTestId('confirm-scan')).toBeVisible()

    await confirmScan(page)
    // รอแถวค้างหาย = POST ยืนยันตอบกลับมาแล้ว (กัน dev compile route ครั้งแรกช้า)
    await expect(scanFeedRows(page)).toHaveCount(0)
    expect((await unitBySerial(serial))?.status).toBe('OUT')
  })

  test('ลบออกจากคิวก่อนยืนยัน -> ของไม่ถูกเบิก', async ({ page }) => {
    const serial = STOCK.notebook[1]
    await scanBurst(page, [serial])
    await expect(page.getByTestId('scan-pending')).toHaveCount(0)

    await page.locator('[data-testid="scan-feed"] tbody tr').first().getByRole('button').click()
    await expect(page.locator('[data-testid="scan-feed"] tbody tr')).toHaveCount(0)
    expect((await unitBySerial(serial))?.status).toBe('IN_STOCK')
  })

  test('เหตุผลติดตอนยิงรายชิ้น แต่ลูกค้าใช้ค่าตอนกดยืนยัน', async ({ page }) => {
    const customer = await prisma.customer.create({
      data: { code: 'E2E-RS', name: 'ลูกค้าเหตุผล' },
    })
    // โหลดหน้าใหม่ให้ dropdown เห็นลูกค้าที่เพิ่งสร้าง (หน้าโหลดรายชื่อตั้งแต่ก่อนสร้าง)
    await page.goto('/scan-out')
    const reasonSelect = page.getByTestId('reason-select')
    const customerSelect = page.getByTestId('customer-select')

    await page.getByTestId('customer-select').selectOption(customer.id)
    await focusScanner(page)

    // ชิ้นแรก: SALE (ค่าเริ่มต้น)
    await scan(page, 'NB-0001')
    await expect(page.getByTestId('scan-pending')).toHaveCount(0)

    // ชิ้นที่สอง: DAMAGED
    await reasonSelect.selectOption('DAMAGED')
    await expect(customerSelect).toBeDisabled() // รอให้ ref ของฟอร์มอัปเดตก่อนยิง
    await focusScanner(page)
    await scan(page, 'NB-0002')
    await expect(page.getByTestId('scan-pending')).toHaveCount(0)

    // เปลี่ยนเหตุผลกลับเป็น SALE ก่อนยืนยัน - ชิ้นที่สองต้องยังเป็น DAMAGED ตามตอนยิง
    await reasonSelect.selectOption('SALE')
    await expect(customerSelect).toBeEnabled()

    await confirmScan(page)
    await expect(scanFeedRows(page)).toHaveCount(0)

    await expect
      .poll(
        async () =>
          prisma.scanLog.count({
            where: { type: 'OUT', serial: { in: ['NB-0001', 'NB-0002'] } },
          }),
        { timeout: 10_000 }
      )
      .toBe(2)

    const sale = await prisma.scanLog.findFirstOrThrow({
      where: { serial: 'NB-0001', type: 'OUT' },
    })
    const damaged = await prisma.scanLog.findFirstOrThrow({
      where: { serial: 'NB-0002', type: 'OUT' },
    })
    expect(sale.reason).toBe('SALE')
    expect(sale.customerId).toBe(customer.id)
    expect(damaged.reason).toBe('DAMAGED')
    // เบิกด้วยเหตุผลอื่นที่ไม่ใช่ขาย -> ไม่ผูกลูกค้า
    expect(damaged.customerId).toBeNull()
  })
})
