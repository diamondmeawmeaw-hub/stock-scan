# First-Receipt Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** วิธีนับสินค้าตัดสินตอนรับเข้าครั้งแรก สลับได้จนกว่าจะบันทึกสำเร็จ

**Architecture:** ฟอร์มเพิ่มไม่ถามวิธีนับ + หน้ารับเข้าโชว์ tabs เฉพาะสินค้าไม่มีประวัติ + PATCH ก่อนบันทึกครั้งแรก

**Tech Stack:** Next.js App Router, Prisma (ไม่อ่าน schema ใหม่), Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-10-12-first-receipt-tracking-design.md`

## Global Constraints

- ห้ามแตะ schema.prisma — ไม่มี migration
- ห้ามแตะ API กฏล็อก (`409` เดิมใช้ต่อ), scan-out/audit/reports, ScanConsole
- ไฟล์แก้: `ProductsClient.tsx` (ฟอร์มเพิ่ม+แก้ไข), `scan-in/page.tsx` (preload), `ScanInClient.tsx`
- "ครั้งแรก" = บันทึกสำเร็จครั้งแรกเท่านั้น — PATCH ล้มเหลว = ไม่ล็อก
- ฟอร์มเพิ่ม default `SERIAL`/`ชิ้น` เหมือนเดิม (แค่ซ่อน dropdown)

## Review Focus

- สินค้ามีประวัติแต่ stockQty=0/unit หมด — คาดว่ายังล็อก (มี scanLog = มีประวัติ)
- กดยืนยันครั้งแรก PATCH สำเร็จแต่รับของล้ม — คาดว่าล็อกแล้ว ครั้งต่อไปใช้วิธีใหม่ (PATCH ก่อนจึงถูกต้อง)
- สองเครื่องรับสินค้าใหม่ตัวเดียวกันพร้อมกันคนละวิธี — คาดว่าฝั่งหลังโดน 409/PRODUCT_MISMATCH (race ยอมรับได้ เหมือน concurrent เดิม)
- สลับ tabs ทั้งที่มีของค้างในคิว — คาดว่าโดนบล็อกให้เคลียร์ก่อน
- e2e สร้างสินค้าใหม่ต้องไม่มี tabs หลังรับครั้งแรก — คาดว่า hasHistory เปลี่ยนหลัง router.refresh

---

### Task 1: ฟอร์มสินค้า (ตัด dropdown + อ่านอย่างเดียว)

**Files:**
- Modify: `src/app/(app)/products/ProductsClient.tsx`
- Test: `tests/e2e/products-search.spec.ts` (ของเดิม, ฟอร์มต้องยังสร้างได้)

**Interfaces:**
- Consumes: `POST /api/products` เดิม (ส่ง trackingType SERIAL เสมอ)
- Produces: ฟอร์มเพิ่มไม่มี trackingType/unit — Task 2 ไม่อิงฟอร์มนี้

- [ ] **Step 1: ตัด dropdown วิธีนับ + หน่วยนับออกจากฟอร์มเพิ่ม (default SERIAL)**

คง state ไว้แต่ไม่ render (กัน edit form ที่แชร์ logic พัง) — ฟอร์มแก้ไขเปลี่ยนวิธีนับเป็นข้อความอ่านอย่างเดียว

- [ ] **Step 2: รัน e2e ฟอร์มสินค้า**

Run: `npm run test:e2e -- products-search`
Expected: PASS (สร้างสินค้าได้โดยไม่เลือกวิธีนับ)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/products/ProductsClient.tsx"
git commit -m "feat(products): ฟอร์มเพิ่มไม่ถามวิธีนับ (default รายชิ้น)"
```

### Task 2: preload hasHistory + tabs หน้ารับเข้า

**Files:**
- Modify: `src/app/(app)/scan-in/page.tsx`, `src/app/(app)/scan-in/ScanInClient.tsx`
- Test: `tests/e2e/scan-in-decide.spec.ts` (ใหม่)

**Interfaces:**
- Consumes: `PATCH /api/products/[id]` เดิม (เปลี่ยนวิธีนับตอนไม่มีประวัติได้อยู่แล้ว)
- Produces: ไม่มี interface ใหม่

- [ ] **Step 1: Write the failing test**

```typescript
test('สินค้าใหม่ไร้ประวัติ -> มี tabs เลือกวิธีรับ', async ({ page }) => {
  // สร้างสินค้าผ่าน UI (ไม่มีให้เลือกวิธีนับ) แล้วเปิดหน้ารับเข้าเลือกสินค้าตัวนั้น
  await expect(page.getByTestId('receive-mode')).toBeVisible()
})
```

```typescript
test('รับแบบจำนวนครั้งแรก -> ครั้งต่อไปไม่มี tabs (ล็อกแล้ว)', async ({ page }) => {
  // ...กรอกจำนวน + ยืนยัน -> reload -> expect(receive-mode).toHaveCount(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- scan-in-decide`
Expected: FAIL (ไม่มี `receive-mode`)

- [ ] **Step 3: Implement preload + tabs + PATCH-ก่อน-บันทึก**

`page.tsx`: preload เพิ่ม `hasHistory = units>0 || stockQty!==0 || scanLogs>0` (ไม่นับ IN_STOCK อย่างเดียว)
`ScanInClient`: ถ้า `!hasHistory` โชว์ tabs `receive-mode` (ยิง serial/กรอกจำนวน + unit select) แทนการดู `trackingType`
- โหมดยิง: pending-confirm เดิมทั้งชุด
- โหมดจำนวน: ฟอร์มเดิม + unit select (เฉพาะตอนยังไม่ล็อก)
- กดยืนยัน/บันทึกครั้งแรก: `PATCH {trackingType, unitLabel}` (ถ้าต่างจากเดิม) ก่อน แล้วรับของตามปกติ — PATCH ล้ม = หยุด ไม่รับของ
- สลับ tabs ตอนมีของค้างในคิว = บล็อกแบบ cross-type เดิม

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- scan-in-decide scan-in`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/scan-in" tests/e2e/scan-in-decide.spec.ts
git commit -m "feat(scan-in): เลือกวิธีรับครั้งแรกตอนรับเข้า"
```

### Task 3: integration ล็อกครั้งที่สอง

**Files:**
- Test: `tests/integration/scan-in.test.ts` (เคสเพิ่ม)
- Test: ไม่ต้องแก้ production (กฏเดิม)

**Interfaces:** ไม่มี interface ใหม่

- [ ] **Step 1: Write the failing test**

```typescript
it('สินค้าใหม่รับแบบจำนวนครั้งแรกได้ ครั้งที่สองยิง serial โดนกัน (ล็อกแล้ว)', async () => {
  // quantityIn ครั้งแรกผ่าน + PATCH เป็น QUANTITY ผ่าน
  // ครั้งที่สอง: scanIn serial -> PRODUCT_MISMATCH หรือ scanOut flow เดิม
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:integration -- scan-in`
Expected: FAIL (ตาม assertion ที่เขียน — ถ้า PASS ตั้งแต่แรกแสดงกฏเดิมครอบอยู่แล้ว ให้เปลี่ยนเป็นเคส lock regression แทน)

- [ ] **Step 3: ยืนยันกฏเดิม + Commit**

Run: `npm run test:integration -- scan-in quantity`
Expected: PASS

```bash
git add tests/integration/scan-in.test.ts
git commit -m "test(scan-in): ล็อกวิธีนับหลังรับครั้งแรก"
```
