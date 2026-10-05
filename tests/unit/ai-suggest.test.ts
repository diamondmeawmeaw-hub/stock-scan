import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

// ล็อก env ทุกเคส - กัน .env เครื่อง dev (ที่มี AI_PROVIDER=openai ไว้ลองของจริง)
// รั่วเข้ามาเปลี่ยนทรง API ระหว่างเทส
beforeEach(() => {
  vi.stubEnv('AI_PROVIDER', 'anthropic')
  vi.stubEnv('AI_API_BASE', 'https://ai.example')
  vi.stubEnv('AI_MODEL', 'test-model')
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

  it('AI ตอบปนคำอธิบาย งัดก้อน JSON ออกมาใช้ได้', async () => {
    vi.stubEnv('AI_API_KEY', 'test-key')
    mockAnthropic(
      'ได้เลยครับ\n{"name":"สายแลน Cat6","brand":"Link","categoryId":"cat-cbl","trackingType":"QUANTITY","unitLabel":"กล่อง"}\nมีอะไรถามเพิ่มได้'
    )
    const out = await suggestProduct('CBL-1', master)
    expect(out).toEqual({
      name: 'สายแลน Cat6',
      brand: 'Link',
      categoryId: 'cat-cbl',
      trackingType: 'QUANTITY',
      unitLabel: 'กล่อง',
    })
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

  it('relay ตอบ 429 -> โยน 429 ข้อความให้รอแล้วกดใหม่', async () => {
    vi.stubEnv('AI_API_KEY', 'test-key')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 429 }))
    const err = await suggestProduct('XXX-1', master).catch((e) => e)
    expect(err.status).toBe(429)
    expect(err.message).toContain('กำลังพัก')
  })

  it('ทรง OpenAI (OpenRouter) อ่าน choices[0].message.content', async () => {
    vi.stubEnv('AI_API_KEY', 'test-key')
    vi.stubEnv('AI_PROVIDER', 'openai')
    vi.stubEnv('AI_API_BASE', 'https://openrouter.ai/api')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  name: 'สายแลน Cat6',
                  brand: 'Link',
                  categoryId: 'cat-cbl',
                  trackingType: 'QUANTITY',
                  unitLabel: 'กล่อง',
                }),
              },
            },
          ],
        }),
        { status: 200 }
      )
    )
    const out = await suggestProduct('CBL-UTP-C6', master)
    expect(out).toEqual({
      name: 'สายแลน Cat6',
      brand: 'Link',
      categoryId: 'cat-cbl',
      trackingType: 'QUANTITY',
      unitLabel: 'กล่อง',
    })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions')
  })
})
