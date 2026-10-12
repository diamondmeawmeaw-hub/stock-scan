# Audit Multi-Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปิดรอบตรวจนับรอบเดียวแล้วติ๊กได้ทั้งหลายประเภท + หลายรุ่น

**Architecture:** scope arrays บน AuditSession + helper `isInScope` ตัวเดียวที่ service ทุกจุดเรียก + ฟอร์มเปิดรอบ 3 โหมด

**Tech Stack:** Next.js App Router, Prisma (Postgres String[]), Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-10-12-audit-multi-scope-design.md`

## Global Constraints

- ไฟล์ใหม่: ไม่มี (ยกเว้น migration ที่ prisma สร้าง)
- ไฟล์แก้: `prisma/schema.prisma`, `src/lib/scan-service.ts`, `src/app/api/audit/sessions/route.ts`, `src/app/(app)/audit/page.tsx`, `src/app/(app)/audit/NewAuditForm.tsx`
- ห้ามแตะ: กฏเปิดทีละรอบ, ขั้นตอนยิง/ปิดรอบ, ScanConsole, API/DB อื่น
- ห้ามลบ `categoryId` เดิม — รอบเก่าต้องอ่านได้
- ทั้งคู่ว่าง = ทั้งคลัง
- `npm run db:migrate` บน dev ก่อน implement (DB ต้องรัน)

## Review Focus

- รอบเก่าที่มีแต่ categoryId ยังนับได้เหมือนเดิม — คาดว่า helper รองรับ legacy
- ติ๊ก product แต่ไม่ติ๊ก category ของมัน — คาดว่ายิงผ่าน (union)
- เปิดรอบโดยไม่ติ๊กอะไรในโหมดกำหนดเอง — คาดว่า route ตีกลับ 400
- ปิดรอบปรับสต็อก — คาดว่าแตะเฉพาะของใน scope
- checkbox รุ่นเยอะๆ (100+) — คาดว่า group ตามประเภท + scroll ได้ ไม่ค้าง

---

### Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create (via prisma): `prisma/migrations/XXXX_add_audit_scope_arrays/migration.sql`
- Test: `npx prisma validate` + เปิด prisma studio ดูคอลัมน์

**Interfaces:**
- Consumes: ไม่มี
- Produces: `AuditSession.categoryIds: string[]`, `AuditSession.productIds: string[]` — Task 2 ใช้ชื่อนี้ตรงตัว

- [ ] **Step 1: เพิ่ม 2 ฟิลด์ใน schema แล้ว migrate**

Run: `docker compose up -d db` (ถ้ายังไม่รัน) แล้ว `npm run db:migrate -- --name add_audit_scope_arrays`
Expected: migration สำเร็จ, ข้อมูลเดิมอยู่ครบ

- [ ] **Step 2: ตรวจว่า client เห็นฟิลด์ใหม่**

Run: `npx prisma validate`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/XXXX_add_audit_scope_arrays
git commit -m "feat(audit): scope คละรุ่น/คละอุปกรณ์ (categoryIds/productIds)"
```

### Task 2: Service scope-union + unit test

**Files:**
- Modify: `src/lib/scan-service.ts` (helper `isInScope` + 5 จุดเดิม)
- Test: `tests/unit/audit-scope.test.ts` (ใหม่)

**Interfaces:**
- Consumes: `categoryIds/productIds` จาก Task 1
- Produces: `isInScope(session: { categoryId, categoryIds, productIds }, product: { id, categoryId }): boolean` (export ให้เทส) — Task 3-4 ใช้ผ่าน API อย่างเดียว

- [ ] **Step 1: Write the failing test**

```typescript
it('ติ๊ก product อย่างเดียว ยิงรุ่นนั้นผ่าน', () => {
  expect(isInScope({ categoryId: null, categoryIds: [], productIds: ['p1'] }, { id: 'p1', categoryId: 'c9' })).toBe(true)
})
```

(บวกเคส: ทั้งคู่ว่าง→true, legacy categoryId→เทียบเท่าเดิม, ตรง category→true, ไม่ตรงเลย→false)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit tests/unit/audit-scope.test.ts`
Expected: FAIL with "isInScope not defined"

- [ ] **Step 3: Implement `isInScope` + เปลี่ยน 5 จุดเดิมมาเรียก**

Logic: ทั้งคู่ว่าง→ทั้งคลัง (ถ้ามี legacy categoryId ใช้ของเดิม), ไม่งั้น `productIds.includes(id) || categoryIds.includes(categoryId)` — 5 จุด: open validate, auditScan scope, report expected, report quantity, close adjust

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add src/lib/scan-service.ts tests/unit/audit-scope.test.ts
git commit -m "feat(audit): scope-union ตรวจนับคละรุ่น/คละอุปกรณ์"
```

### Task 3: API รับ arrays

**Files:**
- Modify: `src/app/api/audit/sessions/route.ts`
- Test: `tests/integration/audit.test.ts` (เคสเพิ่ม)

**Interfaces:**
- Consumes: `isInScope` ทางอ้อมผ่าน service
- Produces: `POST /api/audit/sessions { name, categoryId?, categoryIds?, productIds? }` — Task 4 เรียกใช้

- [ ] **Step 1: Write the failing test**

```typescript
it('เปิดรอบคละรุ่น+คละประเภท -> session เก็บ arrays ครบ', async () => {
  const res = await postJson(sessionsRoute, { name: 'รอบคละ', categoryIds: [fx.category.id], productIds: [fx.product.id] })
  expect(res.status).toBe(200)
  expect(res.body.session).toMatchObject({ categoryIds: [fx.category.id], productIds: [fx.product.id] })
})
```

(บวกเคส: โหมดกำหนดเองแต่ส่งว่างทั้งคู่ → 400)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project integration tests/integration/audit.test.ts`
Expected: FAIL (route ไม่รู้จักฟิลด์ใหม่)

- [ ] **Step 3: Implement zod schema + ส่งต่อ service**

`categoryIds/productIds: string[] default []`, ถ้าโหมด custom (มี key ใดๆ) แล้วว่างทั้งคู่ → 400, คง `categoryId` เดิมไว้ตามเดิม

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:integration -- audit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/audit/sessions/route.ts tests/integration/audit.test.ts
git commit -m "feat(audit): API เปิดรอบรับ scope หลายค่า"
```

### Task 4: UI ฟอร์ม + หน้ารายการ

**Files:**
- Modify: `src/app/(app)/audit/NewAuditForm.tsx`, `src/app/(app)/audit/page.tsx`
- Test: `tests/e2e/audit-multi-scope.spec.ts` (ใหม่)

**Interfaces:**
- Consumes: API จาก Task 3
- Produces: ไม่มี interface ใหม่

- [ ] **Step 1: Write the failing test**

```typescript
test('ติ๊ก 1 ประเภท + 1 รุ่น เปิดรอบ ยิงใน scope ผ่าน นอก scope โดนปฏิเสธ', async ({ page }) => {
  await page.goto('/audit')
  await page.getByTestId('audit-mode-custom').click()
  await page.getByTestId('scope-category').first().check()
  await page.getByTestId('scope-product').first().check()
  await page.getByTestId('start-audit').click()
  await page.waitForURL(/\/audit\/.+/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- audit-multi-scope`
Expected: FAIL (ไม่มี `audit-mode-custom`)

- [ ] **Step 3: Implement ฟอร์ม 3 โหมด + checkbox + scope label**

tabs `audit-mode-all/categories/custom`, checkbox `scope-category/scope-product` + ตัวนับ, validate custom อย่างน้อย 1 อย่าง, `page.tsx` preload products + แสดงขอบเขตย่อ — ไม่แตะ logic เปิดรอบเดิม

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- audit-multi-scope return-audit`
Expected: PASS (ของเก่าไม่พัง)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/audit" tests/e2e/audit-multi-scope.spec.ts
git commit -m "feat(audit): UI เลือกขอบเขตคละรุ่น/คละอุปกรณ์"
```
