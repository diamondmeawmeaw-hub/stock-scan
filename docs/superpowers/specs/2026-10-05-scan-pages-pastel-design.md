# Scan Pages Pastel Redesign — Design Spec

วันที่: 2026-10-05
สถานะ: รอ user รีวิวสเปคก่อนเขียนแผน

## 1. ความเข้าใจร่วม (Intent)

- ผลลัพธ์ที่ต้องการ: หน้าสแกน (`scan-in` / `scan-out` / `audit/[id]`) ดูสนุกสดใส อ่านง่าย ฟอนต์ใหญ่ แต่ไม่เอาเกมจ๋า (ไม่มีแต้ม/คอมโบ/ตัวละคร)
- ผู้ใช้: พนักงานคลัง 2-10 คน ใช้เครื่องสแกน HID (พิมพ์เร็ว + Enter) ทำงานนาน ต้องการสบายตา
- ความสำเร็จ: ยิงสแกนเร็วเท่าเดิม (focus/Enter/beep/queue ไม่พัง), ตัวหนังสือใหญ่แตะง่ายแม้ใส่ถุงมือ, หน้าอื่นไม่เปลี่ยน
- ข้อตกลง: STAFF จัดการ master ได้เหมือนเดิม (ไม่ล็อกสิทธิ์), เรื่อง location พับไว้ก่อน

## 2. ขอบเขต

แตะเฉพาะจุดสแกน:
- `src/app/globals.css` — เพิ่ม utilities ใหม่ (`scan-hero`, `btn-pop`, `card-pop`, `scan-input`) โทนพาสเทล
- `src/components/ScanConsole.tsx` — ขยาย input/feed/stats/ปุ่มลบ (classes อย่างเดียว ไม่แตะ logic queue/focus/beep)
- `src/app/(app)/scan-in/ScanInClient.tsx`, `scan-out/ScanOutClient.tsx`, `audit/[id]/AuditSessionClient.tsx` — ครอบ hero + เปลี่ยน classes

ไม่แตะ:
- `NavBar`, `(app)/layout`, หน้าอื่น (`products/categories/reports/serials/sales/users/...`)
- `src/lib/scan-service.ts`, `scan-rules.ts`, `auth.ts`, API routes, Prisma schema, DB migration

## 3. Section 1 — พาเลตต์ + ฟอนต์ (อนุมัติแล้ว)

- พื้น: ฟ้าอ่อน/ครีม (`sky-50`/`amber-50`) เฉพาะ container หน้าสแกน ไม่แตะ `body`
- การ์ด: ขาวขอบสีพาสเทลหนา (`border-2 sky-200/amber-200`) มุมมนใหญ่
- ช่องสแกน: `text-2xl font-mono` ขอบหนา focus วงแหวนนุ่ม (`focus:ring-4 sky-200`)
- ปุ่ม: ใหญ่ chunky — ยืนยันเขียวมิ้นต์ (`emerald-300` ตัวหนังสือ `emerald-950`), รองฟ้า/พีช (`sky-200/amber-200` ตัวเข้ม)
- ผล: accepted เขียวมิ้นต์พื้น (`emerald-100` + ตัวเข้ม), rejected ชมพูแดงนุ่ม (`rose-100` + ตัวเข้ม)
- ฟอนต์: ใช้ `font-sans` (Sarabun) เดิม ไม่เพิ่มฟอนต์ใหม่

## 4. Section 2 — Components (อนุมัติแล้ว)

- `ScanConsole`: label ใหญ่ขึ้น, input สูงขึ้น (`py-3`), feed แถวสูงแตะง่าย, ปุ่มลบ (`onDelete`) ขยายแตะง่าย, แถบ stats ตัวเลขใหญ่สีชัด
- `ScanIn/ScanOut`: ปุ่ม confirm เต็มความกว้าง (`w-full py-3`) กดง่ายด้วยถุงมือ
- `Audit`: tile หาย/เกิน/นับแล้วใช้สีพาสเทลเดิมของระบบ (แดง/เขียว/ฟ้าโทนอ่อน)
- ห้ามเปลี่ยน: `autoFocus`, `onBlur refocus`, `Enter→clear+queue+drain`, `beep()`, `pendingKeys` guard, `Ctrl+Enter confirm`

## 5. Section 3 — Safety + Testing (อนุมัติแล้ว)

- เปลี่ยนแค่ CSS/classes — logic สแกน/API/DB เหมือนเดิม 100%
- ตรวจ: `npm run test:e2e` (scan-in 12 เคสยิงรัว 20 ชิ้น + Enter), เช็ค focus กลับ, beep ไม่ error, เปิดมือถือคลังดูไม่แตก
- เกณฑ์ผ่าน: e2e scan ชุดเดิมเขียว, ไม่มี migration, ไม่มี API เปลี่ยน

## 6. ส่วนเสริม — หน้าค้นหา Serial (อนุมัติปากเปล่า 2026-10-05)

- ปัญหา: ตารางตัดคำไทยแนวตั้ง (ผล/สินค้า/ผู้สแกน) การ์ดซ้อนเยอะ hero คนละโทน
- เปลี่ยน: hero → `scan-hero`, หัวตาราง `bg-sky-50/text-sky-900`, คอลัมน์ผลเป็น `ResultBadge` (pill ไม่ตัดคำ เขียว/แดงนุ่ม/เหลืองตามผล ข้อความเดิม), สินค้า/ผู้สแกน/serial `whitespace-nowrap` (ตาราง scroll แนวนอนได้อยู่แล้ว), ฟอร์มค้นหา → `card-pop`
- ไม่แตะ: testid, logic ค้นหา/ฟิลเตอร์/คืนของ, ข้อความผล

## 7. Self-review

- Placeholder: ไม่มี TBD — สี/ไฟล์/เกณฑ์ชัดแล้ว
- Consistency: scope เฉพาะสแกนตรงกันทุก section, ไม่ขัดเรื่องสิทธิ์ staff หรือ location ที่พับไว้
- Scope: โฟกัสพอเขียนแผนเดียวจบ (CSS + 4 ไฟล์ client)
- Ambiguity: "พาสเทล" ล็อกเป็น sky/amber/emerald/rose โทนอ่อน + ตัวหนังสือเข้มแล้ว ไม่ตีความได้สองแบบ
