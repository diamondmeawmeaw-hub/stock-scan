import { afterEach, describe, expect, it, vi } from 'vitest'
import { suggestProduct, type SuggestMaster } from '@/lib/ai-suggest'

const master: SuggestMaster = {
  categories: [
    { id: 'cat-ap', code: 'AP', name: 'Access Point' },
    { id: 'cat-cbl', code: 'CBL', name: 'สายแลน / สายสัญญาณ' },
  ],
  brands: ['UniFi', 'Link'],
}

function mockAnthropic(text: string, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        content: [{ type: 'text', text }],
      }),
      { status }
    )
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('suggestProduct', () => {
  it('เติมข้อมูลครบเมื่อ AI ตอบตรง master', async () => {
    vi.stubEnv('AI_API_KEY', 'test-key')
    mockAnthropic(
      JSON.stringify({
        name: 'UniFi U6 Lite Access Point',
        brand: 'UniFi',
        categoryId: 'cat-ap',
        trackingType: 'SERIAL',
        unitLabel: null,
      })
    )
    const out = await suggestProduct('AP-UNF-U6L', master)
    expect(out).toEqual({
      name: 'UniFi U6 Lite Access Point',
      brand: 'UniFi',
      categoryId: 'cat-ap',
      trackingType: 'SERIAL',
      unitLabel: null,
    })
  })

  it('categoryId ที่ไม่อยู่ใน master ต้องกลายเป็นค่าว่าง', async () => {
    vi.stubEnv('AI_API_KEY', 'test-key')
    mockAnthropic(
      JSON.stringify({
        name: 'ของแปลก',
        brand: 'NoBrand',
        categoryId: 'nope',
        trackingType: 'SERIAL',
        unitLabel: null,
      })
    )
    const out = await suggestProduct('XXX-1', master)
    expect(out.categoryId).toBe('')
    expect(out.name).toBe('ของแปลก')
  })

  it('AI ตอบไม่ใช่ JSON ต้องโยน error อ่านรู้เรื่อง', async () => {
    vi.stubEnv('AI_API_KEY', 'test-key')
    mockAnthropic('ไม่ใช่ json เลย')
    await expect(suggestProduct('XXX-1', master)).rejects.toThrow('AI ตอบกลับมาไม่ใช่รูปแบบที่อ่านได้')
  })

  it('trackingType เพี้ยนต้อง default เป็น SERIAL', async () => {
    vi.stubEnv('AI_API_KEY', 'test-key')
    mockAnthropic(
      JSON.stringify({
        name: 'X',
        brand: '',
        categoryId: '',
        trackingType: 'WEIRD',
        unitLabel: null,
      })
    )
    const out = await suggestProduct('XXX-1', master)
    expect(out.trackingType).toBe('SERIAL')
  })

  it('ไม่มี AI_API_KEY ต้องโยน error บอกให้ตั้งค่า', async () => {
    vi.stubEnv('AI_API_KEY', '')
    await expect(suggestProduct('XXX-1', master)).rejects.toThrow('ยังไม่ได้ตั้งค่า AI_API_KEY')
  })
})
