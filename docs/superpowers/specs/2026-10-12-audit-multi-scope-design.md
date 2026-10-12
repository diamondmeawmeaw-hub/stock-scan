# Audit คละรุ่น/คละอุปกรณ์ — Design Spec

วันที่: 2026-10-12
สถานะ: รอ user รีวิวสเปคก่อนเขียนแผน

## 1. ความเข้าใจร่วม (Intent)

- ผลลัพธ์: เปิดรอบตรวจนับรอบเดียวแล้วเลือกได้ทั้งหลายประเภท + หลายรุ่น (รวมกัน)
- ผู้ใช้: พนักงานคลังนับของคละกัน ไม่ต้องเปิดหลายรอบ
- ความสำเร็จ: ยิงใน scope ผ่านทั้งสองแบบ, นอก scope โดน NOT_IN_SCOPE, missing/surplus คิดเฉพาะใน scope
- สมมติฐาน: scope = union, เลือกด้วย checkbox, รอบเก่ายังอ่านได้เหมือนเดิม

## 2. ขอบเขต

แตะ:
- `prisma/schema.prisma` — `AuditSession` เพิ่ม `categoryIds String[] + productIds String[]` (+ migration)
- `src/lib/scan-service.ts` — scope 5 จุดเดิม (`open/auditScan/scan scope/report/close`) จาก `=== categoryId` เป็น `in-set`
- `POST /api/audit/sessions` — รับ `categoryIds/productIds` (คง `categoryId` เดิมไว้)
- `NewAuditForm` — 3 โหมด + checkbox, `audit/page.tsx` — preload สินค้าด้วย + โชว์ขอบเขตย่อ

ไม่แตะ:
- กฏเปิดได้ทีละรอบ, ขั้นตอนยิง/ปิดรอบ, `ScanConsole`, API/DB อื่น, `categoryId` เดิม (อ่านประวัติ)

## 3. Section 1 — Schema (อนุมัติแล้ว)

- `categoryIds String[] @default([])`, `productIds String[] @default([])`
- ทั้งคู่ว่าง = ทั้งคลัง (เท่าของเดิม), `categoryId` เดิมไม่ลบ (รอบเก่าใช้ต่อ)
- migration มาตรฐาน ไม่แตะข้อมูลเดิม

## 4. Section 2 — Service (อนุมัติแล้ว)

- helper ใหม่ `isInScope(session, product)`:
  - ทั้งคู่ว่าง → true
  - รอบเก่า (`categoryId` อย่างเดียว) → เทียบเท่าเดิม
  - ไม่งั้น → `productIds.includes(product.id) || categoryIds.includes(product.categoryId)`
- `auditScan`: นอก scope → `NOT_IN_SCOPE` (rejected) เหมือนเดิม
- `buildAuditReport/close`: expected/missing/surplus/quantityLines เฉพาะใน scope, ปรับสต็อกแตะแค่ใน scope

## 5. Section 3 — UI (อนุมัติแล้ว)

- `NewAuditForm`: tabs ทั้งคลัง / เลือกประเภท / กำหนดเอง
  - เลือกประเภท: checkbox รายประเภท
  - กำหนดเอง: checkbox ประเภททั้งหมด + checkbox รุ่นทั้งหมด group ตามประเภท + ตัวนับที่ติ๊ก + validate อย่างน้อย 1 อย่าง
- `audit/page.tsx`: โชว์ขอบเขตย่อ (`AP, SW + อีก 2 รุ่น`, ทั้งคลังถ้าว่าง)

## 6. Section 4 — Testing (อนุมัติแล้ว)

- migrate บน dev ก่อน ข้อมูลเดิมไม่หาย
- unit: `isInScope` (ทั้งคลัง/รอบเก่า/ตรง product/ตรง category/นอก scope)
- integration: เปิดรอบคละ ยิงในทั้งสองแบบผ่าน ยิงนอกโดน NOT_IN_SCOPE ปิดรอบ missing/surplus ถูก + รอบเก่า categoryId ยังทำงาน
- e2e: ติ๊ก checkbox เปิดรอบ ยิง ปิดรอบ

## 7. Self-review

- Placeholder: ไม่มี TBD — ชื่อฟิลด์, semantics union, UI modes, ครบ
- Consistency: ทั้งคลัง = ว่างทั้งคู่ ตรงกันทุก section, รอบเก่าไม่พัง
- Scope: พอแผนเดียวจบ (schema 1 + service 1 + UI 2 + test)
- Ambiguity: union vs intersect ล็อกเป็น union แล้ว
