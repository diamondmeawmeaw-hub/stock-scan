# Scan Pages Pastel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แต่งหน้าสแกน 3 หน้าให้สดใสพาสเทล อ่านง่าย โดยไม่แตะ logic สแกน

**Architecture:** เพิ่ม utilities พาสเทลใน `globals.css` แล้วเปลี่ยนแค่ classes ใน `ScanConsole` + 3 หน้าสแกน ไม่แตะ API/DB/service

**Tech Stack:** Next.js App Router, Tailwind CSS v4 (`@utility`), Playwright (e2e scan)

**Spec:** `docs/superpowers/specs/2026-10-05-scan-pages-pastel-design.md`

## Global Constraints

- แตะเฉพาะ: `src/app/globals.css`, `src/components/ScanConsole.tsx`, `src/app/(app)/scan-in/ScanInClient.tsx`, `src/app/(app)/scan-out/ScanOutClient.tsx`, `src/app/(app)/audit/[id]/AuditSessionClient.tsx`
- ห้ามแตะ: `src/lib/*`, `src/app/api/*`, `prisma/*`, `NavBar`, `(app)/layout`, หน้าอื่น
- ห้ามเปลี่ยน logic: `autoFocus`, `onBlur refocus`, `Enter→clear+queue+drain`, `beep()`, `pendingKeys` guard, `Ctrl+Enter confirm`
- โทน: พาสเทล sky/amber/emerald/rose + ตัวหนังสือเข้ม ไม่เพิ่มฟอนต์ใหม่

## Review Focus

- ช่องสแกนยังรับ HID รัวๆ + Enter ได้โดยไม่ตกหล่น — คาดว่า classes ใหม่ไม่ขวาง event
- focus กลับเข้าช่องสแกนหลังยิงเหมือนเดิม — คาดว่าไม่แตะ `useEffect[disabled]` focus
- ปุ่ม confirm ใหญ่ขึ้นแต่ยังเรียก `onConfirm` ชุดเดิม — คาดว่าไม่เปลี่ยน props
- สี accepted/rejected ยังแยกชัดสำหรับคนตาบอดสีระดับทั่วไป — คาดว่าใช้ทั้งสี+ข้อความ ไม่ใช่สีอย่างเดียว
- หน้าจอมือถือคลังไม่แตก (feed แถวสูงขึ้น) — คาดว่าใช้ `flex-wrap` เดิม ไม่ล้น

---

### Task 1: Pastel utilities ใน globals.css

**Files:**
- Modify: `src/app/globals.css:17-44`
- Test: `tests/e2e/scan-in.spec.ts` (ของเดิม — regression เท่านั้น)

**Interfaces:**
- Consumes: `@utility` pattern เดิม (`btn`, `card`, `field`, `label`)
- Produces: `scan-hero`, `card-pop`, `btn-pop`, `btn-pop-primary`, `scan-input`, `stat-pop-ok`, `stat-pop-bad` — Task 2/3 เรียกใช้ชื่อนี้ตรงตัว

- [ ] **Step 1: เพิ่ม utilities พาสเทลต่อท้าย `globals.css`**

Implement `scan-hero` (พื้น `bg-gradient-to-br from-sky-100 via-amber-50 to-rose-100` + `rounded-2xl border-2 border-white shadow-sm`), `card-pop` (`card` + `border-2`), `btn-pop` (`btn` + `rounded-xl border-2 px-5 py-3 text-base`), `btn-pop-primary` (`btn-pop` + `bg-emerald-300 text-emerald-950 border-emerald-400 hover:bg-emerald-200`), `scan-input` (`field` + `text-2xl font-mono py-3 border-2 focus:ring-4 ring-sky-200`), `stat-pop-ok`/`stat-pop-bad` (พื้น `emerald-100`/`rose-100` + ตัวเข้ม) ใน `src/app/globals.css`

- [ ] **Step 2: รัน unit tests ยืนยันว่าไม่กระทบ logic**

Run: `npm run test`
Expected: PASS (67 เคสเดิมเขียว — utilities ใหม่ไม่แตะ logic)

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style(scan): add pastel utilities for scan pages"
```

### Task 2: Restyle ScanConsole (classes อย่างเดียว)

**Files:**
- Modify: `src/components/ScanConsole.tsx:55-419`
- Test: `tests/e2e/scan-in.spec.ts` (ของเดิม)

**Interfaces:**
- Consumes: `scan-input`, `card-pop`, `stat-pop-ok`, `stat-pop-bad`, `btn-pop`, `btn-pop-primary` จาก Task 1
- Produces: `ScanConsole` props/logic เหมือนเดิมทุกตัว — Task 3 ใช้ต่อโดยไม่เปลี่ยน signature

- [ ] **Step 1: เปลี่ยน classes ใน ScanConsole เท่านั้น**

ใน `src/components/ScanConsole.tsx`: label `text-base font-semibold`, input ใช้ `scan-input`, feed rows ใช้ `card-pop` + ปุ่มลบ `btn-pop px-3 py-2`, stats ใช้ `stat-pop-ok`/`stat-pop-bad` ตัวเลข `text-xl`, ปุ่ม confirm ใช้ `btn-pop-primary w-full` — ห้ามแตะ `useRef/useState/useEffect`, `drain`, `beep`, `onScan/onDelete/onConfirm` signatures

- [ ] **Step 2: รัน e2e หน้าสแกนกัน regression**

Run: `npm run test:e2e -- scan-in`
Expected: PASS (ยิงรัว+Enter เหมือนเดิม; ถ้า focus/queue พัง เคสนี้แดงก่อน)

- [ ] **Step 3: Commit**

```bash
git add src/components/ScanConsole.tsx
git commit -m "style(scan): pastel restyle ScanConsole"
```

### Task 3: ครอบ hero + จัด 3 หน้าสแกน

**Files:**
- Modify: `src/app/(app)/scan-in/ScanInClient.tsx`, `src/app/(app)/scan-out/ScanOutClient.tsx`, `src/app/(app)/audit/[id]/AuditSessionClient.tsx`
- Test: `tests/e2e/scan-in.spec.ts`, `tests/e2e/return-audit.spec.ts` (ของเดิม)

**Interfaces:**
- Consumes: `scan-hero`, `card-pop`, `btn-pop` จาก Task 1; `ScanConsole` จาก Task 2 (props เดิม)
- Produces: 3 หน้าสแกนโทนเดียวกัน — ไม่มี interface ใหม่ให้ task อื่น

- [ ] **Step 1: ครอบ hero + เปลี่ยน form/buttons เป็น pop classes**

ทั้ง 3 ไฟล์: เพิ่ม `<div className="scan-hero ...">` ครอบหัวข้อ + คำอธิบายหน้า, form เลือกสินค้า/ลูกค้าใช้ `card-pop`, ปุ่มรองใช้ `btn-pop` — ห้ามแตะ `formRef`, `onScan` closures, `audit close/quantity` logic

- [ ] **Step 2: รัน e2e สแกน + audit กัน regression**

Run: `npm run test:e2e -- scan-in return-audit`
Expected: PASS ทั้งสองชุด

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/scan-in/ScanInClient.tsx" "src/app/(app)/scan-out/ScanOutClient.tsx" "src/app/(app)/audit/[id]/AuditSessionClient.tsx"
git commit -m "style(scan): pastel hero for scan-in/out/audit"
```
