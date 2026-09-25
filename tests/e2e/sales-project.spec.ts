import { expect, focusScanner, loginAs, logout, prisma, scan, test } from './fixtures'

/** ยิงแล้วไม่รอผลจากหน้าจอ ต้องรอ log โผล่ในฐานก่อนค่อยตรวจ */
async function waitForSaleLog(serial: string) {
  await expect
    .poll(
      async () =>
        (await prisma.scanLog.findFirst({ where: { serial, type: 'OUT' }, select: { id: true } }))?.id,
      { timeout: 10_000 }
    )
    .toBeTruthy()
  return (await prisma.scanLog.findFirst({ where: { serial, type: 'OUT' } }))!
}

test.describe('โปรเจคของลูกค้า', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
  })

  test('เบิกขาย -> สร้างโปรเจค inline -> log ผูกครบ, ดูได้ที่หน้าลูกค้า, ย้ายได้ที่หน้าขาย', async ({
    page,
  }) => {
    const customer = await prisma.customer.create({ data: { code: 'E2E-C1', name: 'คณะนิติ' } })

    // ── 1) หน้าเบิกออก: เลือกลูกค้าแล้วสร้างโปรเจคใหม่ ──
    await page.goto('/scan-out')
    await page.getByTestId('customer-select').selectOption(customer.id)
    await expect(page.getByTestId('project-field')).toBeVisible()

    await page.getByTestId('project-new-name').fill('ติดกล้อง ตึก 1')
    await page.getByTestId('project-create').click()
    // รอให้สร้างเสร็จและเลือกโปรเจคใหม่ก่อนยิงของ
    await expect(page.getByTestId('project-new-name')).toHaveValue('')
    await expect(page.getByTestId('project-select')).not.toHaveValue('')

    await focusScanner(page)
    await scan(page, 'NB-0001')

    const log = await waitForSaleLog('NB-0001')
    expect(log.customerId).toBe(customer.id)
    expect(log.projectId).toBeTruthy()
    const created = await prisma.project.findUniqueOrThrow({ where: { id: log.projectId! } })
    expect(created.name).toBe('ติดกล้อง ตึก 1')

    // ── 2) หน้าลูกค้า: ขยายดูโปรเจคของคนนี้ได้ ──
    await page.goto('/customers')
    await page.getByTestId('toggle-projects').click()
    await expect(page.getByTestId('project-list')).toContainText('ติดกล้อง ตึก 1')
    await expect(page.getByTestId('project-row')).toContainText('ขายแล้ว 1 รายการ')

    // ── 3) หน้าประวัติการขาย: ย้ายรายการข้ามโปรเจค (admin เท่านั้น) ──
    const second = await prisma.project.create({
      data: { customerId: customer.id, name: 'ติด wifi ห้องประชุม' },
    })
    await logout(page)
    await loginAs(page, 'admin')
    await page.goto('/sales')
    const row = page.getByTestId('sale-row').first()
    await expect(row.getByTestId('row-project-select')).toHaveValue(created.id)
    await row.getByTestId('row-project-select').selectOption(second.id)
    await expect
      .poll(async () => (await prisma.scanLog.findFirst({ where: { serial: 'NB-0001' } }))?.projectId)
      .toBe(second.id)

    // ── 4) กรองตามโปรเจค ──
    await page.getByTestId('filter-project').selectOption(second.id)
    await page.getByTestId('apply-filters').click()
    await expect(page.getByTestId('sale-row')).toHaveCount(1)

    await page.getByTestId('filter-project').selectOption(created.id)
    await page.getByTestId('apply-filters').click()
    await expect(page.getByTestId('sales-empty')).toBeVisible()
  })

  test('ยิงขายโดยไม่ระบุโปรเจค -> log ไม่ผูกโปรเจค แต่ย้ายเข้าทีหลังได้', async ({ page }) => {
    const customer = await prisma.customer.create({ data: { code: 'E2E-C2', name: 'คณะวิศวะ' } })
    const project = await prisma.project.create({ data: { customerId: customer.id, name: 'เดินสายแลน' } })

    await page.goto('/scan-out')
    await page.getByTestId('customer-select').selectOption(customer.id)
    await focusScanner(page)
    await scan(page, 'NB-0002')

    const log = await waitForSaleLog('NB-0002')
    expect(log.projectId).toBeNull()

    await logout(page)
    await loginAs(page, 'admin')
    await page.goto('/sales')
    await page.getByTestId('sale-row').first().getByTestId('row-project-select').selectOption(project.id)
    await expect
      .poll(async () => (await prisma.scanLog.findFirst({ where: { serial: 'NB-0002' } }))?.projectId)
      .toBe(project.id)
  })

  test('staff เปิดหน้าประวัติการขาย -> เห็นชื่อโปรเจคอย่างเดียว ไม่มีให้เปลี่ยน', async ({
    page,
  }) => {
    const customer = await prisma.customer.create({ data: { code: 'E2E-C3', name: 'คณะแพทย์' } })

    await page.goto('/scan-out')
    await page.getByTestId('customer-select').selectOption(customer.id)
    await focusScanner(page)
    await scan(page, 'NB-0003')
    await waitForSaleLog('NB-0003')

    await page.goto('/sales')
    const row = page.getByTestId('sale-row').first()
    await expect(row.getByTestId('row-project-name')).toHaveText('-')
    await expect(row.getByTestId('row-project-select')).toHaveCount(0)

    // ยิง PATCH ตรงๆ ก็ถูกกันด้วย (ฝั่งเซิร์ฟเวอร์)
    const log = await waitForSaleLog('NB-0003')
    const res = await page.request.patch(`/api/scan-logs/${log.id}`, {
      data: { projectId: null },
    })
    expect(res.status()).toBe(403)
  })
})
