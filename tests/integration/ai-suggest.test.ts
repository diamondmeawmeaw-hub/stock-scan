import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as suggestRoute } from '@/app/api/products/suggest/route'
import { postJson, seedFixtures } from './helpers'
import type { Handler } from './helpers'

vi.mock('@/lib/ai-suggest', () => ({
  suggestProduct: vi.fn(),
}))

import { suggestProduct } from '@/lib/ai-suggest'

const mocked = vi.mocked(suggestProduct)

describe('POST /api/products/suggest', () => {
  beforeEach(async () => {
    await seedFixtures()
    vi.clearAllMocks()
  })

  it('keyword ว่าง -> 400', async () => {
    const res = await postJson(suggestRoute as Handler, { keyword: '  ' })
    expect(res.status).toBe(400)
  })

  it('mock สำเร็จ -> 200 ได้ shape ครบ', async () => {
    mocked.mockResolvedValue({
      name: 'UniFi U6 Lite Access Point',
      brand: 'UniFi',
      categoryId: 'cat-ap',
      trackingType: 'SERIAL',
      unitLabel: null,
    })
    const res = await postJson(suggestRoute as Handler, { keyword: 'AP-UNF-U6L' })
    expect(res.status).toBe(200)
    expect(res.body.suggestion).toMatchObject({
      name: 'UniFi U6 Lite Access Point',
      trackingType: 'SERIAL',
    })
    expect(mocked).toHaveBeenCalledOnce()
    expect(mocked.mock.calls[0][0]).toBe('AP-UNF-U6L')
  })

  it('lib โยน error -> status ตรง + ข้อความอ่านรู้เรื่อง', async () => {
    const { HttpError } = await import('@/lib/auth')
    mocked.mockRejectedValue(new HttpError(400, 'ยังไม่ได้ตั้งค่า AI_API_KEY'))
    const res = await postJson(suggestRoute as Handler, { keyword: 'AP-UNF-U6L' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('AI_API_KEY')
  })
})
