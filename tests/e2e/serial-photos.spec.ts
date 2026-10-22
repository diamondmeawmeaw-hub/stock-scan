import {
  confirmScan,
  expect,
  focusScanner,
  loginAs,
  prisma,
  scan,
  scanBurst,
  scanFeedRows,
  selectProduct,
  test,
} from './fixtures'

/** PNG 1×1 พอให้ผ่านการตรวจลายเซ็นไฟล์ */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const PHOTO = { name: 'nvr.png', mimeType: 'image/png', buffer: PNG }

test.describe('รูปอุปกรณ์สำหรับเครม', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
  })

  test('รับเข้าแล้วแนบรูปต่อทันที -> เห็นรูปในหน้าค้นหา serial', async ({ page }) => {
    await page.goto('/scan-in')
    await selectProduct(page, 'IT-NB')
    await scanBurst(page, ['NB-9101'])
    await confirmScan(page)
    await expect(scanFeedRows(page)).toHaveCount(0)

    // การ์ด "แนบรูปอุปกรณ์ที่เพิ่งรับเข้า" ต้องโผล่พร้อม serial ที่เพิ่งบันทึก
    const panel = page.getByTestId('recent-received-photos')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('NB-9101')

    await panel.getByTestId('photo-open').click()
    const dialog = page.getByTestId('photo-dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByTestId('photo-input').setInputFiles(PHOTO)
    await expect(dialog.getByTestId('photo-item')).toHaveCount(1)
    await expect(dialog.getByTestId('photo-item')).toContainText('รูปตัวอุปกรณ์')

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    // หน้าค้นหา serial ต้องเห็นรูปที่เพิ่งแนบ (โหลดจาก DB จริง)
    await page.goto('/serials?serial=NB-9101')
    const card = page.getByTestId('serial-photos')
    await expect(card).toBeVisible()
    await expect(card.getByTestId('photo-item')).toHaveCount(1)
    await expect(card).toContainText('1/8')
  })

  test('ประวัติการขาย: เปิดดูรูป ดาวน์โหลด และลบได้', async ({ page }) => {
    await page.goto('/scan-out')
    await focusScanner(page)
    await scan(page, 'NB-0001')
    await confirmScan(page)
    await expect(scanFeedRows(page)).toHaveCount(0)

    // ยิงแล้วไม่รอผลบนจอ - รอจน log การขายลงฐานก่อนเปิดหน้าประวัติ
    await expect
      .poll(
        async () =>
          (
            await prisma.scanLog.findFirst({
              where: { serial: 'NB-0001', type: 'OUT' },
              select: { id: true },
            })
          )?.id,
        { timeout: 10_000 }
      )
      .toBeTruthy()

    await page.goto('/sales')
    const row = page.getByTestId('sale-row').filter({ hasText: 'NB-0001' }).first()
    await expect(row).toBeVisible()

    await row.getByTestId('photo-open').click()
    const dialog = page.getByTestId('photo-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('NB-0001')

    await dialog.getByTestId('photo-input').setInputFiles(PHOTO)
    await expect(dialog.getByTestId('photo-item')).toHaveCount(1)

    // ปุ่มดาวน์โหลดต้องได้ไฟล์จริง ไม่ใช่หน้า HTML
    const downloadPromise = page.waitForEvent('download')
    await dialog.getByTestId('photo-download').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('nvr.png')

    // ลบรูป (มี confirm)
    page.once('dialog', (dialogBox) => void dialogBox.accept())
    await dialog.getByTestId('photo-delete').click()
    await expect(dialog.getByTestId('photo-item')).toHaveCount(0)
    await expect(dialog).toContainText('ยังไม่มีรูป')
  })
})
