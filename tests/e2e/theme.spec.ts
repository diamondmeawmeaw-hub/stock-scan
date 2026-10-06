import { expect, test } from './fixtures'
import { loginAs } from './fixtures'

test.describe('สวิตช์โหมดมืด', () => {
  test('กดมืด -> reload -> ยังมืด + กลับสว่างได้', async ({ page }) => {
    await loginAs(page, 'staff')
    const html = page.locator('html')
    const toggle = page.getByTestId('theme-toggle')

    await toggle.click()
    await expect(html).toHaveClass(/dark/)
    await expect(toggle).toHaveAttribute('aria-label', 'เปลี่ยนเป็นโหมดสว่าง')

    await page.reload()
    await expect(html).toHaveClass(/dark/)

    await toggle.click()
    await expect(html).not.toHaveClass(/dark/)
    await expect(toggle).toHaveAttribute('aria-label', 'เปลี่ยนเป็นโหมดมืด')
  })
})
