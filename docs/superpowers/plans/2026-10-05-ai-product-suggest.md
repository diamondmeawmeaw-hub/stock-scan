# AI Product Suggest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** กดปุ่ม AI ในฟอร์มเพิ่มสินค้าแล้วได้ชื่อ/แบรนด์/หมวดหมู่มาเติมอัตโนมัติ

**Architecture:** route ใหม่รับ keyword → lib เรียก Gemini JSON mode พร้อม master context → zod validate → client fill ฟอร์มเพิ่ม (ไม่ auto-save)

**Tech Stack:** Next.js App Router, fetch เพียว (ไม่เพิ่ม dep), Anthropic messages API ผ่าน relay (`xi/ling-3.1-flash`), zod, vitest

**Spec:** `docs/superpowers/specs/2026-10-05-ai-product-suggest-design.md`

## Global Constraints

- ไฟล์ใหม่: `src/lib/ai-suggest.ts`, `src/app/api/products/suggest/route.ts`
- ไฟล์แก้: `src/app/(app)/products/ProductsClient.tsx` (ฟอร์มเพิ่มเท่านั้น), `.env.example`
- ห้ามแตะ: ฟอร์มแก้ไข, `POST /api/products`, `prisma/*`, logic สแกน
- ห้ามเพิ่ม dependency — เรียก `POST {AI_API_BASE}/v1/messages` ด้วย `fetch` (header `x-api-key: AI_API_KEY`, body `{ model: AI_MODEL, max_tokens, messages }`, อ่านข้อความจาก `content[]` ที่ `type: 'text'`)
- คีย์จาก `AI_API_KEY` (+ `AI_API_BASE`, `AI_MODEL` มี default) เท่านั้น ห้ามส่งคีย์ผ่าน browser
- ไม่ auto-save เด็ดขาด — แค่ fill ฟอร์ม
- ห้ามยิง Gemini จริงในเทส (mock `fetch` ระดับ lib)

## Review Focus

- keyword ว่าง/ยาวเกิน/อักขระประหลาด — คาดว่า zod ตัดที่ route
- Gemini ตอบ JSON เพี้ยน/ไม่ใช่ JSON — คาดว่า parse fail แล้ว error ภาษาไทย
- categoryId ที่ AI ตอบไม่อยู่ใน master — คาดว่าเว้นว่าง ไม่ยัดค่ามั่ว
- ไม่ตั้ง `AI_API_KEY` — คาดว่าปุ่มแจ้งเตือน ไม่พังทั้งหน้า
- กดปุ่มซ้ำตอนกำลังโหลด — คาดว่า disable ปุ่มตอน busy

---

### Task 1: lib เรียก Gemini + validate

**Files:**
- Create: `src/lib/ai-suggest.ts`
- Test: `tests/unit/ai-suggest.test.ts`

**Interfaces:**
- Consumes: `HttpError` จาก `@/lib/auth`, master `{ categories: { id, code, name }[], brands: string[] }`
- Produces: `suggestProduct(keyword: string, master: SuggestMaster): Promise<ProductSuggestion>` โดย `ProductSuggestion = { name: string; brand: string; categoryId: string; trackingType: 'SERIAL' | 'QUANTITY'; unitLabel: string | null }` (`categoryId = ''` แปลว่า AI จับคู่ไม่ได้) — Task 2 เรียกใช้ชื่อนี้ตรงตัว

- [ ] **Step 1: Write the failing test**

```typescript
it('categoryId ที่ไม่อยู่ใน master ต้องกลายเป็นค่าว่าง', async () => {
  mockFetchJson({ name: 'X', brand: 'Y', categoryId: 'nope', trackingType: 'SERIAL', unitLabel: null })
  const out = await suggestProduct('LKA-200', master)
  expect(out.categoryId).toBe('')
})
```

(บวกเคส: JSON เพี้ยน→โยน error อ่านรู้เรื่อง, ไม่มีคีย์→โยน error บอกให้ตั้งค่า, trackingType เพี้ยน→default SERIAL)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit tests/unit/ai-suggest.test.ts`
Expected: FAIL with "suggestProduct not defined" (mock `globalThis.fetch` ในไฟล์เทส ห้ามยิงเน็ตจริง)

- [ ] **Step 3: Implement `suggestProduct` in `src/lib/ai-suggest.ts`**

ใช้ `fetch` POST `{AI_API_BASE}/v1/messages` (header `x-api-key`, body `{ model: AI_MODEL, max_tokens: 500, messages: [{ role: 'user', content: prompt }] }`, timeout 30 วิ via `AbortSignal.timeout` — relay ต่างประเทศช้ากว่า), สั่งโมเดลใน prompt ว่า "ตอบ JSON อย่างเดียวตาม schema", parse `content[]` แล้ว zod validate (`categoryId` ต้องอยู่ใน master ไม่งั้น `''`), error ทุกแบบเป็นข้อความไทยผ่าน `HttpError`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project unit tests/unit/ai-suggest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-suggest.ts tests/unit/ai-suggest.test.ts
git commit -m "feat(ai): suggest product info via Gemini"
```

### Task 2: API route + ปุ่มในฟอร์มเพิ่ม

**Files:**
- Create: `src/app/api/products/suggest/route.ts`
- Modify: `src/app/(app)/products/ProductsClient.tsx` (ฟอร์มเพิ่มเท่านั้น), `.env.example`
- Test: `tests/integration/ai-suggest.test.ts`

**Interfaces:**
- Consumes: `suggestProduct` จาก Task 1 (ชื่อ+signature ตรงตัว)
- Produces: `POST /api/products/suggest { keyword } → { suggestion: ProductSuggestion }` — ไม่มี task ต่อไป

- [ ] **Step 1: Write the failing test**

```typescript
it('ไม่มี AI_API_KEY ตอบ 400 ข้อความชัด', async () => {
  const res = await postJson(suggestRoute, { keyword: 'LKA-200' })
  expect(res.status).toBe(400)
})
```

(บวกเคส: keyword ว่าง→400, mock suggestProduct สำเร็จ→200 ได้ shape ครบ — mock ระดับ `suggestProduct` ไม่ยิงเน็ต)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project integration tests/integration/ai-suggest.test.ts`
Expected: FAIL with "route not defined / 404"

- [ ] **Step 3: Implement route + ปุ่มฟอร์ม**

route: `z.object({ keyword: trim min1 max40 })` → `requireUser()` → โหลด categories + distinct brands → เรียก `suggestProduct` → `{ suggestion }`; client: ปุ่ม `✨ เติมด้วย AI` ข้างช่อง SKU ฟอร์มเพิ่ม + `suggestBusy/suggestError` + `setForm` จากผลลัพธ์ (เขียนทับทั้งหมด); `.env.example` เพิ่ม `# AI เติมข้อมูลสินค้า (ไม่บังคับ): AI_API_BASE / AI_API_KEY / AI_MODEL` — ห้ามแตะฟอร์มแก้ไข

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test` แล้ว `npm run test:integration -- ai-suggest`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/products/suggest/route.ts" "src/app/(app)/products/ProductsClient.tsx" .env.example tests/integration/ai-suggest.test.ts
git commit -m "feat(ai): ปุ่ม AI เติมข้อมูลในฟอร์มเพิ่มสินค้า"
```
