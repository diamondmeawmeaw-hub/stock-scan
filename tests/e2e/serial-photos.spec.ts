import {
  confirmScan,
  expect,
  focusScanner,
  loginAs,
  prisma,
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

/**
 * สร้างสินค้าประเภท NVR (ประเภทที่เปิดเก็บรูป) - ข้อมูลตั้งต้นมีแต่ IT/TOOL
 * ที่ไม่เปิดเก็บรูป จึงต้องสร้างเองต่อเทส
 */
async function createNvr(serial?: string) {
  const category = await prisma.category.create({
    data: { code: 'NVR', name: 'เครื่องบันทึกกล้อง (NVR)', photosEnabled: true },
  })
  const product = await prisma.product.create({
    data: {
      sku: 'NVR-HIK-16',
      name: 'NVR Hikvision 16 ช่อง',
      brand: 'Hikvision',
      categoryId: category.id,
      trackingType: 'SERIAL',
    },
  })
  if (serial) {
    await prisma.serialUnit.create({
      data: { serial, productId: product.id, status: 'IN_STOCK', receivedAt: new Date() },
    })
  }
  return product
}

test.describe('รูปอุปกรณ์สำหรับเครม', () => {
  test.beforeEach(async ({ page, data: _data }) => {
    await loginAs(page, 'staff')
  })

  test('รับเข้าแล้วแนบรูปต่อทันที -> เห็นรูปในหน้าค้นหา serial', async ({ page }) => {
    await createNvr()
    await page.goto('/scan-in')
    await selectProduct(page, 'NVR Hik')
    await scanBurst(page, ['NVR-9101'])
    await confirmScan(page)
    await expect(scanFeedRows(page)).toHaveCount(0)

    // การ์ด "แนบรูปอุปกรณ์ที่เพิ่งรับเข้า" ต้องโผล่พร้อม serial ที่เพิ่งบันทึก
    const panel = page.getByTestId('recent-received-photos')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('NVR-9101')

    await panel.getByTestId('photo-open').click()
    const dialog = page.getByTestId('photo-dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByTestId('photo-input').setInputFiles(PHOTO)
    await expect(dialog.getByTestId('photo-item')).toHaveCount(1)
    await expect(dialog.getByTestId('photo-item')).toContainText('รูปตัวอุปกรณ์')

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    // หน้าค้นหา serial ต้องเห็นรูปที่เพิ่งแนบ (โหลดจาก DB จริง)
    await page.goto('/serials?serial=NVR-9101')
    const card = page.getByTestId('serial-photos')
    await expect(card).toBeVisible()
    await expect(card.getByTestId('photo-item')).toHaveCount(1)
    await expect(card).toContainText('1/8')
  })

  test('ลากรูปมาวางในกล่องรูปได้เลย', async ({ page }) => {
    await createNvr()
    await page.goto('/scan-in')
    await selectProduct(page, 'NVR Hik')
    await scanBurst(page, ['NVR-9201'])
    await confirmScan(page)
    await expect(scanFeedRows(page)).toHaveCount(0)

    const panel = page.getByTestId('recent-received-photos')
    await panel.getByTestId('photo-open').click()
    const dialog = page.getByTestId('photo-dialog')
    await expect(dialog).toBeVisible()

    // จำลองการลากไฟล์จาก Explorer มาวาง (DataTransfer + File จริงในเบราว์เซอร์)
    const dataTransfer = await page.evaluateHandle((base64) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }))
      return dt
    }, PNG.toString('base64'))

    const dropzone = dialog.getByTestId('photo-dropzone')
    await dropzone.dispatchEvent('dragover', { dataTransfer })
    await dropzone.dispatchEvent('drop', { dataTransfer })

    await expect(dialog.getByTestId('photo-item')).toHaveCount(1)
    await expect(dialog.getByTestId('photo-item')).toContainText('รูปตัวอุปกรณ์')

    const saved = await prisma.serialImage.findFirstOrThrow({
      where: { unit: { serial: 'NVR-9201' } },
    })
    expect(saved.fileName).toBe('dropped.png')
    expect(saved.mimeType).toBe('image/png')
  })

  test('กดดูรูปแล้วเลื่อนรูปก่อนหน้า/ถัดไปได้ และใช้ลูกศรได้', async ({ page }) => {
    await createNvr('NVR-9301')
    await page.goto('/serials?serial=NVR-9301')
    const card = page.getByTestId('serial-photos')
    await expect(card).toBeVisible()

    await card.getByTestId('photo-input').setInputFiles([
      PHOTO,
      { ...PHOTO, name: 'nvr-2.png' },
    ])
    await expect(card.getByTestId('photo-item')).toHaveCount(2)

    await card.getByTestId('photo-item').first().getByRole('button').first().click()
    const preview = page.getByTestId('photo-preview')
    await expect(preview).toBeVisible()
    await expect(preview.getByTestId('photo-counter')).toHaveText('1 / 2')
    // รูปแรก: ย้อนกลับไม่ได้ แต่ไปต่อได้
    await expect(preview.getByTestId('photo-prev')).toBeDisabled()
    await expect(preview.getByTestId('photo-next')).toBeEnabled()

    await preview.getByTestId('photo-next').click()
    await expect(preview.getByTestId('photo-counter')).toHaveText('2 / 2')
    await expect(preview.getByTestId('photo-next')).toBeDisabled()

    // ลูกศรซ้ายเลื่อนกลับได้
    await page.keyboard.press('ArrowLeft')
    await expect(preview.getByTestId('photo-counter')).toHaveText('1 / 2')

    await page.keyboard.press('Escape')
    await expect(preview).toHaveCount(0)
  })

  test('ประวัติการขาย: เปิดดูรูป ดาวน์โหลด และลบได้ (เฉพาะประเภทที่เปิดเก็บรูป)', async ({
    page,
  }) => {
    await createNvr('NVR-0001')
    await page.goto('/scan-out')
    await focusScanner(page)
    await scanBurst(page, ['NVR-0001', 'NB-0001'])
    await confirmScan(page)
    await expect(scanFeedRows(page)).toHaveCount(0)

    // ยิงแล้วไม่รอผลบนจอ - รอจน log การขายลงฐานก่อนเปิดหน้าประวัติ
    await expect
      .poll(
        async () =>
          prisma.scanLog.count({
            where: { type: 'OUT', serial: { in: ['NVR-0001', 'NB-0001'] } },
          }),
        { timeout: 10_000 }
      )
      .toBe(2)

    await page.goto('/sales')
    const row = page.getByTestId('sale-row').filter({ hasText: 'NVR-0001' }).first()
    await expect(row).toBeVisible()

    // สินค้าประเภทอื่นที่ไม่ได้เปิดเก็บรูป ต้องไม่มีปุ่มแนบรูป
    const otherRow = page.getByTestId('sale-row').filter({ hasText: 'NB-0001' }).first()
    await expect(otherRow).toBeVisible()
    await expect(otherRow.getByTestId('photo-open')).toHaveCount(0)

    await row.getByTestId('photo-open').click()
    const dialog = page.getByTestId('photo-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('NVR-0001')

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
