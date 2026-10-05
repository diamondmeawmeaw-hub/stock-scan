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

const DEFAULT_BASE_URL = 'https://n8n.carwraman.shop'
const DEFAULT_MODEL = 'xi/ling-3.1-flash'

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
    'ตอบ JSON อย่างเดียว ไม่ต้องอธิบายเพิ่ม รูปแบบ:',
    '{"name":"ชื่อสินค้าเต็ม","brand":"ยี่ห้อ","categoryId":"...","trackingType":"SERIAL หรือ QUANTITY","unitLabel":"หน่วยนับหรือ null"}',
    'trackingType: ของเป็นชิ้นมี serial (AP, Switch, กล้อง) = SERIAL, ของนับเป็นจำนวน (ตู้แร็ค, สายแลน) = QUANTITY',
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

  let res: Response
  try {
    res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        messages: [{ role: 'user', content: buildPrompt(keyword, master) }],
      }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new HttpError(502, 'ติดต่อ AI ไม่ได้ - เช็คเน็ตแล้วลองใหม่ หรือกรอกเองได้เลย')
  }
  if (!res.ok) {
    throw new HttpError(502, `AI ตอบกลับมาไม่สำเร็จ (${res.status}) - ลองใหม่ หรือกรอกเองได้เลย`)
  }

  const body = (await res.json()) as {
    content?: { type?: string; text?: string }[]
  }
  const text = (body.content ?? []).find((c) => c.type === 'text' && c.text)?.text
  if (!text) throw new HttpError(502, 'AI ตอบกลับมาไม่ใช่รูปแบบที่อ่านได้ - ลองใหม่ หรือกรอกเองได้เลย')

  let parsed: unknown
  try {
    // กัน AI ห่อ ```json ... ``` มาด้วย
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    parsed = JSON.parse(cleaned)
  } catch {
    throw new HttpError(502, 'AI ตอบกลับมาไม่ใช่รูปแบบที่อ่านได้ - ลองใหม่ หรือกรอกเองได้เลย')
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
