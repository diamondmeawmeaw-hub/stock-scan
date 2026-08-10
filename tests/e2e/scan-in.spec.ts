import {
  countInStock,
  expect,
  expectScanTotals,
  focusScanner,
  lastScan,
  loginAs,
  prisma,
  scan,
  scanBurst,
  scanFeedRows,
  test,
  unitBySerial,
} from './fixtures'

test.describe('รับเข้าสต็อก (scan-in)', () => {
  // ต้องขอ fixture `data` ตรงนี้ด้วย ไม่งั้น Playwright จะ seed ฐานข้อมูลหลัง login
  // ทำให้ผู้ใช้ที่เพิ่ง login ถูกล้างทิ้งไปพร้อมข้อมูลรอบก่อน
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
    await page.goto('/scan-in')
  })

  test('ยังไม่เลือกสินค้า -> ยิงไม่ได้ ช่องสแกนถูกปิดไว้', async ({ data: _data, page }) => {
    const input = page.getByTestId('scan-input')
    await expect(input).toBeDisabled()
    await expect(input).toHaveAttribute('placeholder', 'เลือกสินค้าก่อนถึงจะยิงได้')

    await page.getByTestId('product-select').selectOption({ index: 1 })
    await expect(input).toBeEnabled()
    await expect(input).toBeFocused()
  })

  test('ยิงรัว 20 ชิ้นติดกันโดยไม่รอผล -> เข้าคลังครบทุกชิ้น ไม่มีตกหล่น', async ({ data, page }) => {
    const serials = Array.from({ length: 20 }, (_, i) => `NB-9${String(i).padStart(3, '0')}`)

    await page.getByTestId('product-select').selectOption(data.products.notebook.id)
    await scanBurst(page, serials)

    await expectScanTotals(page, { accepted: serials.length, rejected: 0 })
    await expect(scanFeedRows(page)).toHaveCount(serials.length)

    // ของจริงในฐานข้อมูล: 3 ชิ้นเดิม + 20 ชิ้นที่เพิ่งยิง
    expect(await countInStock(data.products.notebook.id)).toBe(23)
    const saved = await prisma.serialUnit.findMany({
      where: { serial: { in: serials } },
      select: { serial: true, status: true },
    })
    expect(saved).toHaveLength(serials.length)
    expect(saved.every((u) => u.status === 'IN_STOCK')).toBe(true)
  })

  test('ยิง serial เดิมซ้ำ -> ปฏิเสธ และของยังมีชิ้นเดียว', async ({ data, page }) => {
    await page.getByTestId('product-select').selectOption(data.products.notebook.id)
    await scanBurst(page, ['NB-7001', 'NB-7001'])

    await expectScanTotals(page, { accepted: 1, rejected: 1 })
    await expect(lastScan(page)).toHaveAttribute('data-accepted', 'false')
    await expect(lastScan(page)).toContainText('ยิงซ้ำ')

    expect(await prisma.serialUnit.count({ where: { serial: 'NB-7001' } })).toBe(1)
  })

  test('เครื่องสแกนยิงตัวพิมพ์เล็กหรือมีช่องว่างท้าย -> เก็บเป็นตัวพิมพ์ใหญ่ตัวเดียวกัน', async ({
    data,
    page,
  }) => {
    await page.getByTestId('product-select').selectOption(data.products.notebook.id)
    await scanBurst(page, ['nb-8001 ', 'NB-8001'])

    // ตัวแรกรับเข้า ตัวที่สองเป็นการยิงซ้ำของชิ้นเดียวกัน
    await expectScanTotals(page, { accepted: 1, rejected: 1 })
    expect(await unitBySerial('NB-8001')).not.toBeNull()
    expect(await prisma.serialUnit.count({ where: { serial: 'nb-8001' } })).toBe(0)
  })

  test('serial สั้นเกินไป -> ตีกลับทันทีโดยไม่แตะคลัง', async ({ data, page }) => {
    await page.getByTestId('product-select').selectOption(data.products.notebook.id)
    await scanBurst(page, ['A1'])

    await expectScanTotals(page, { accepted: 0, rejected: 1 })
    await expect(lastScan(page)).toContainText('สั้นเกินไป')
    expect(await countInStock(data.products.notebook.id)).toBe(3)
  })

  test('กด Enter เปล่าๆ -> ไม่มีอะไรเกิดขึ้น', async ({ data, page }) => {
    await page.getByTestId('product-select').selectOption(data.products.notebook.id)
    await focusScanner(page)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')

    await expectScanTotals(page, { accepted: 0, rejected: 0 })
    await expect(scanFeedRows(page)).toHaveCount(0)
  })

  test('serial ของสินค้าอื่น -> ปฏิเสธ กันของผูกผิดตัว', async ({ data, page }) => {
    await page.getByTestId('product-select').selectOption(data.products.monitor.id)
    await scanBurst(page, ['NB-0001'])

    await expectScanTotals(page, { accepted: 0, rejected: 1 })
    await expect(lastScan(page)).toContainText('ผูกกับสินค้าอื่น')

    const unit = await unitBySerial('NB-0001')
    expect(unit?.productId).toBe(data.products.notebook.id)
  })

  test('เผลอคลิกที่ว่างบนหน้าจอ -> โฟกัสกลับมาที่ช่องสแกนเอง ยิงต่อได้เลย', async ({
    data,
    page,
  }) => {
    await page.getByTestId('product-select').selectOption(data.products.notebook.id)
    await focusScanner(page)

    await page.locator('body').click({ position: { x: 5, y: 400 } })
    await expect(page.getByTestId('scan-input')).toBeFocused()

    // ยิงต่อโดยไม่ต้องคลิกกลับเข้าช่อง
    await scan(page, 'NB-6001')
    await expectScanTotals(page, { accepted: 1, rejected: 0 })
  })

  test('หมายเหตุของรอบนี้ติดไปกับทุกชิ้นที่ยิง', async ({ data, page }) => {
    await page.getByTestId('product-select').selectOption(data.products.notebook.id)
    await page.locator('#note').fill('รับจาก PO-2568-001')
    await scanBurst(page, ['NB-5001', 'NB-5002'])
    await expectScanTotals(page, { accepted: 2, rejected: 0 })

    const logs = await prisma.scanLog.findMany({ where: { type: 'IN' } })
    expect(logs).toHaveLength(2)
    expect(logs.every((l) => l.note === 'รับจาก PO-2568-001')).toBe(true)
  })

  test('ของที่เบิกออกไปแล้ว ยิงรับกลับเข้าคลังได้', async ({ data, page }) => {
    await prisma.serialUnit.update({
      where: { serial: 'NB-0001' },
      data: { status: 'OUT', releasedAt: new Date() },
    })

    await page.reload()
    await page.getByTestId('product-select').selectOption(data.products.notebook.id)
    await scanBurst(page, ['NB-0001'])

    await expectScanTotals(page, { accepted: 1, rejected: 0 })
    await expect(lastScan(page)).toContainText('รับกลับเข้าคลัง')
    expect((await unitBySerial('NB-0001'))?.status).toBe('IN_STOCK')
  })

  test('ยอดคงเหลือบนหน้าจออัปเดตตามที่ยิงไปแล้ว', async ({ data, page }) => {
    await page.getByTestId('product-select').selectOption(data.products.monitor.id)
    await expect(page.getByText('ตอนนี้ในคลังมี 2 ชิ้น')).toBeVisible()

    await scanBurst(page, ['MON-9001'])
    await expect(lastScan(page)).toContainText('คงเหลือ 3 ชิ้น')
  })
})
