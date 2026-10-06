import { z } from 'zod'
import { HttpError } from './auth'

export type SuggestMaster = {
  categories: { id: string; code: string; name: string }[]
  brands: string[]
}

export type ProductSuggestion = {
  name: string
  brand: string
  /** '' = AI จับคู่หมวดหมู่ไม่ได้ ให้คนเลือกเอง */
  categoryId: string
  trackingType: 'SERIAL' | 'QUANTITY'
  unitLabel: string | null
}

const DEFAULT_PROVIDER = 'openai'
const DEFAULT_BASE_URL = 'https://openrouter.ai/api'
const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free'

const suggestionSchema = z.object({
  name: z.string().trim().min(1).max(150).catch(''),
  brand: z.string().trim().max(80).catch(''),
  categoryId: z.string().trim().catch(''),
  trackingType: z.enum(['SERIAL', 'QUANTITY']).catch('SERIAL'),
  unitLabel: z.string().trim().max(20).nullable().catch(null),
})

function buildPrompt(keyword: string, master: SuggestMaster): string {
  const cats = master.categories.map((c) => `- ${c.id}: ${c.code} ${c.name}`).join('\n')
  const brands = master.brands.length > 0 ? master.brands.join(', ') : '(ยังไม่มีแบรนด์ในระบบ)'
  return [
    'ช่วยจัดหมวดหมู่สินค้าอุปกรณ์เน็ตเวิร์ค/กล้องวงจรปิดจากรหัสหรือชื่อรุ่นนี้:',
    `"${keyword}"`,
    '',
    'หมวดหมู่ที่มีในระบบ (ตอบ categoryId จากรายการนี้เท่านั้น ถ้าไม่เข้าอันไหนเลยให้ตอบว่าง):',
    cats || '(ยังไม่มีหมวดหมู่ในระบบ)',
    '',
    `แบรนด์ที่มีในระบบ: ${brands}`,
    '',
    'ตอบ JSON object อย่างเดียว ห้ามมีข้อความอื่นนอก JSON มีคีย์พวกนี้เท่านั้น:',
    '- name: string ชื่อสินค้าเต็ม (ห้ามตอบว่าชื่อสินค้าเต็ม ให้เติมชื่อจริง)',
    '- brand: string ยี่ห้อ (ห้ามตอบว่ายี่ห้อ ให้เติมยี่ห้อจริง ถ้าไม่รู้ตอบว่าง)',
    '- categoryId: string เอา id จากรายการข้างบนเท่านั้น ถ้าไม่เข้าอันไหนเลยตอบว่าง',
    '- trackingType: ตอบ SERIAL ถ้าเป็นของรายชิ้นมี serial (AP, Switch, กล้อง) / QUANTITY ถ้าเป็นของนับจำนวน (ตู้แร็ค, สายแลน)',
    '- unitLabel: string หน่วยนับ หรือ null ถ้าเป็น SERIAL',
  ].join('\n')
}

/**
 * ขอ AI ช่วยเติมข้อมูลสินค้าจากรหัส/ชื่อรุ่น - ใช้แค่ตอนกดปุ่มในฟอร์มเพิ่มสินค้า
 * คีย์อยู่ฝั่ง server เท่านั้น ห้ามเรียกจาก browser ตรง
 */
export async function suggestProduct(
  keyword: string,
  master: SuggestMaster
): Promise<ProductSuggestion> {
  const apiKey = process.env.AI_API_KEY?.trim()
  if (!apiKey) {
    throw new HttpError(400, 'ยังไม่ได้ตั้งค่า AI_API_KEY - ใส่ใน .env แล้วรีสตาร์ท (ดู .env.example)')
  }
  const baseUrl = (process.env.AI_API_BASE?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL
  // ทรง API: relay นี้ใช้ทรง Anthropic, OpenRouter ใช้ทรง OpenAI - สลับผ่าน env ได้ไม่ต้องแก้โค้ด
  const provider = (process.env.AI_PROVIDER?.trim().toLowerCase() || DEFAULT_PROVIDER) as
    | 'anthropic'
    | 'openai'

  const prompt = buildPrompt(keyword, master)
  // สั่งห้ามพล่ามก่อนตอบ - โมเดลเล็กถ้าปล่อยคิดดังจะช้าเป็นนาที (เจอมาแล้ว 50 วิ)
  const systemPrompt =
    'You are a product classifier. Output ONLY the JSON object. No thinking, no explanation, no markdown.'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let url: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pickText: (body: any) => string | undefined
  if (provider === 'openai') {
    url = `${baseUrl}/v1/chat/completions`
    headers.Authorization = `Bearer ${apiKey}`
    payload = {
      model,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    }
    pickText = (body) => body.choices?.[0]?.message?.content ?? undefined
  } else {
    url = `${baseUrl}/v1/messages`
    headers['x-api-key'] = apiKey
    payload = {
      model,
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }
    pickText = (body) =>
      (body.content as { type?: string; text?: string }[] | undefined)?.find(
        (c) => c.type === 'text' && c.text
      )?.text
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    })
  } catch (err) {
    console.error('[ai-suggest] fetch failed:', err instanceof Error ? err.message : err)
    throw new HttpError(502, 'ติดต่อ AI ไม่ได้ - เช็คเน็ตแล้วลองใหม่ หรือกรอกเองได้เลย')
  }
  if (!res.ok) {
    if (res.status === 429) {
      throw new HttpError(429, 'AI กำลังพัก (คนใช้เยอะ) - รอสักครู่แล้วกดใหม่ หรือกรอกเองได้เลย')
    }
    throw new HttpError(502, `AI ตอบกลับมาไม่สำเร็จ (${res.status}) - ลองใหม่ หรือกรอกเองได้เลย`)
  }

  const body = await res.json()
  const text = pickText(body)
  if (!text) throw new HttpError(502, 'AI ตอบกลับมาไม่ใช่รูปแบบที่อ่านได้ - ลองใหม่ หรือกรอกเองได้เลย')

  let parsed: unknown
  try {
    // กัน AI ห่อ ```json ... ``` มาด้วย
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    parsed = JSON.parse(cleaned)
  } catch {
    // โมเดลเล็กชอบตอบปนคำอธิบาย - งัดก้อน {...} ก้อนแรกออกมา
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      throw new HttpError(502, 'AI ตอบกลับมาไม่ใช่รูปแบบที่อ่านได้ - ลองใหม่ หรือกรอกเองได้เลย')
    }
    try {
      parsed = JSON.parse(match[0])
    } catch {
      throw new HttpError(502, 'AI ตอบกลับมาไม่ใช่รูปแบบที่อ่านได้ - ลองใหม่ หรือกรอกเองได้เลย')
    }
  }
  const data = suggestionSchema.parse(parsed)

  const categoryOk = master.categories.some((c) => c.id === data.categoryId)
  return {
    name: data.name,
    brand: data.brand,
    categoryId: categoryOk ? data.categoryId : '',
    trackingType: data.trackingType,
    unitLabel: data.unitLabel,
  }
}
