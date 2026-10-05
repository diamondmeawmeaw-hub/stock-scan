# Smart Product Cataloging (AI เติมข้อมูลสินค้า) — Design Spec

วันที่: 2026-10-05
สถานะ: รอ user รีวิวสเปคก่อนเขียนแผน

## 1. ความเข้าใจร่วม (Intent)

- ผลลัพธ์: กรอก SKU/ชื่อรุ่นคร่าวๆ (เช่น `LKA-200`, `AP-MNT-MP10-D`) กดปุ่ม AI แล้วฟอร์มเพิ่มสินค้าถูกเติมอัตโนมัติ (ชื่อเต็ม, แบรนด์, หมวดหมู่, วิธีนับ, หน่วยนับ)
- ผู้ใช้: STAFF/ADMIN ตอนเพิ่มสินค้าใหม่ (ข้อตกลงเดิม: staff จัดการ master ได้)
- ความสำเร็จ: ลดเวลากรอก + ชื่อสินค้ามาตรฐานขึ้น โดยคนยังเป็นคนตรวจก่อนบันทึกเสมอ
- สมมติฐาน: AI เติมอิสระทุกช่อง (ไม่บังคับตรง master), ใช้ relay ฟรี (`xi/ling-3.1-flash` เทสผ่านแล้ว), ปุ่มอยู่เฉพาะฟอร์มเพิ่ม

## 2. ขอบเขต

แตะ:
- ใหม่ `src/lib/ai-suggest.ts` — เรียก Gemini + prompt + zod validate
- ใหม่ `src/app/api/products/suggest/route.ts` — รับ keyword, โหลด master, คืน suggestion
- แก้ `src/app/(app)/products/ProductsClient.tsx` — เฉพาะฟอร์มเพิ่ม (ปุ่ม + state + fill)
- เพิ่ม `.env.example` — `AI_API_BASE / AI_API_KEY / AI_MODEL` (ไม่บังคับตั้ง)

ไม่แตะ:
- ฟอร์มแก้ไขสินค้า, `POST /api/products`, schema.prisma (ไม่มี migration), logic สแกนทั้งหมด
- ไม่เพิ่ม dependency (ใช้ `fetch` เพียวเรียก `generativelanguage.googleapis.com`)

## 3. Section 1 — Architecture (อนุมัติแล้ว)

Flow: ปุ่มข้างช่อง SKU → `POST /api/products/suggest { keyword }` (`requireUser`)
→ server โหลด Category ทั้งหมด + brand ที่มีในระบบ → ประกอบ prompt
→ `POST {AI_API_BASE}/v1/messages` ทรง Anthropic messages API
  (default `https://n8n.carwraman.shop`, header `x-api-key: AI_API_KEY`,
  body `{ model: AI_MODEL (default `xi/ling-3.1-flash`), max_tokens, messages }`,
  อ่านข้อความจาก `content[].text` — ทั้ง 4 ค่า (`AI_PROVIDER/AI_API_BASE/AI_API_KEY/AI_MODEL`)
  มาจาก `.env` เผื่อย้ายค่ายทีหลังไม่ต้องแก้โค้ด (`AI_PROVIDER=openai` ใช้ทรง OpenAI ทรง OpenRouter))
→ zod validate: `name/brand/trackingType/unitLabel` รับค่าอิสระ,
  `categoryId` ต้องตรง master ถ้าไม่ตรงให้เว้นว่าง (`''`)
→ client fill ลงฟอร์มเพิ่ม (เขียนทับทั้งหมด — ฟอร์มของใหม่เลยทับได้)
→ คนตรวจแล้วกดบันทึกเอง ไม่ auto-save เด็ดขาด

## 4. Section 2 — Components (อนุมัติแล้ว)

- `src/lib/ai-suggest.ts`: `suggestProduct(keyword, master): Promise<Suggestion|null>`
  (prompt, เรียก API, parse+validate; โยน `HttpError` ข้อความไทยเมื่อคีย์หาย/คีย์ผิด/โควต้าหมด/ตอบเพี้ยน)
- `src/app/api/products/suggest/route.ts`: `z.object({ keyword: min1 max40 })`
  → โหลด categories + distinct brands → เรียก lib → คืน `{ suggestion }`
- `ProductsClient.tsx` (ฟอร์มเพิ่มเท่านั้น): ปุ่ม `✨ เติมด้วย AI` + `suggestBusy/suggestError`
  + fill `setForm` จากผลลัพธ์

## 5. Section 3 — Safety + Testing (อนุมัติแล้ว)

- ไม่ตั้ง `AI_API_KEY`: ปุ่มกดแล้วแจ้ง "ยังไม่ได้ตั้งค่า ดู .env.example" ไม่พัง
- คีย์ผิด/โควต้าหมด/เน็ตหลุด/timeout (10 วิ): โชว์ข้อความไทย กรอกมือต่อได้
- unit test: zod validate (categoryId เพี้ยน→เว้นว่าง, JSON เพี้ยน→error อ่านรู้เรื่อง)
- integration test: ยิง route ตรง (mock `fetch` ระดับ lib ไม่ยิง Gemini จริง)
  + เคสไม่มีคีย์ → 400 ข้อความชัด
- ห้ามในสเปคนี้: auto-save, auto-create category/brand, เรียก AI ตอนบันทึก (เฉพาะตอนกดปุ่ม)

## 6. Self-review

- Placeholder: ไม่มี TBD — model (`xi/ling-3.1-flash` default, เปลี่ยนผ่าน env), endpoint, timeout, ไฟล์ ครบ
- Consistency: เติมอิสระแต่ categoryId ต้องตรง master (กัน FK error) ตรงกันทุก section
- Scope: พอแผนเดียวจบ (2 ไฟล์ใหม่ + 1 ไฟล์แก้ + test)
- Ambiguity: "เขียนทับทั้งหมด" เฉพาะฟอร์มเพิ่มของใหม่ ไม่กระทบฟอร์มแก้ไขที่ไม่ได้แตะ
