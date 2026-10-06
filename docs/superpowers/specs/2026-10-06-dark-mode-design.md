# Dark Mode ทั้งระบบ — Design Spec

วันที่: 2026-10-06
สถานะ: รอ user รีวิวสเปคก่อนเขียนแผน

## 1. ความเข้าใจร่วม (Intent)

- ผลลัพธ์: โหมดมืดทั้งระบบ มีสวิตช์เปิด/ปิด
- ผู้ใช้: พนักงานคลัง (ใช้กลางคืน/ที่แสงน้อยสบายตาขึ้น)
- ความสำเร็จ: สว่างเหมือนเดิมเป๊ะทุกจุด, มืดแล้วอ่านออกทุกตัว, รีเฟรชแล้วยังจำค่าที่เลือก
- สมมติฐาน: ครั้งแรกตามเครื่อง (`prefers-color-scheme`) หลังจากนั้นจำใน `localStorage` (`stock-theme`)

## 2. ขอบเขต

แตะ (classes อย่างเดียว):
- `src/app/globals.css` — `@custom-variant dark`, variables `:root/.dark`, utilities เดิมอ้าง variables
- `src/app/layout.tsx` — inline script กันกะพริบ (อ่าน localStorage/system ก่อน paint)
- ใหม่ `src/components/ThemeToggle.tsx` + วางใน `NavBar`
- ไล่เติม `dark:` ทุกไฟล์ UI: ScanConsole, ProductPicker, NavBar, ReturnButton,
  หน้า scan-in/out, audit (+[id]), serials, reports, sales, products, categories,
  vendors, customers, users, login, dashboard

ไม่แตะ:
- logic/API/DB/scan-service/auth, สูตรสี pastel เดิมในโหมดสว่าง

## 3. Section 1 — กลไกธีม (อนุมัติแล้ว)

- `@custom-variant dark (&:where(.dark, .dark *));` (Tailwind v4)
- variables: `--bg, --surface, --border, --text, --muted` (สว่าง = ค่าเดิม slate, มืด = slate-950/900/700/100/400)
- `@utility btn/btn-primary/btn-ghost/btn-danger/card/field/label` + `body` อ้าง variables
- `scan-hero/card-pop/btn-pop/scan-input/stat-*` (โทนพาสเทลหน้าสแกน) เพิ่มรุ่น `.dark` ให้เข้ากับพื้นมืด
- `ThemeToggle`: ปุ่ม ☀/🌙 (`data-testid="theme-toggle"`), `localStorage stock-theme: light|dark|system` (default system)
- inline script ใน `<head>`: อ่านค่าก่อน paint กัน FOUC

## 4. Section 2 — Coverage (อนุมัติแล้ว)

หลักแปลงทุกไฟล์:
- `bg-white` → `dark:bg-slate-900`, `bg-slate-50/100` → `dark:bg-slate-800/900`
- `text-slate-900/700` คง/เข้ม, `text-slate-600/500/400` → `dark:text-slate-300/400`
- `border-slate-200/300` → `dark:border-slate-700`, `ring/divide` ตาม
- ป้ายผล: `emerald-50/text-700` → `dark:emerald-950/dark:text-emerald-300` (แดง/เหลือง/ฟ้าแบบเดียวกัน)
- thead `bg-slate-50` → `dark:bg-slate-800`, แถว error `bg-red-50/50` → `dark:bg-red-950/40`
- input/select/placeholder ในโหมดมืดต้องอ่านออก (`color-scheme: dark` กันปฏิทิน/dropdown ขาว)

## 5. Section 3 — Safety + Testing (อนุมัติแล้ว)

- เปลี่ยนแค่ classes — logic/API/DB เหมือนเดิม
- unit test ใหม่: อ่าน/เขียน `stock-theme` + default ตาม system (mock matchMedia)
- e2e เพิ่ม 1 เคส: กด toggle → reload → ยังมืด + กลับมาสว่างได้
- e2e ชุดเดิมต้องเขียวทั้งหมด (รันโหมดสว่าง default)
- ตรวจด้วยตา: ทุกหน้าหลัก 2 โหมด (สว่างต้องเหมือนเดิมเป๊ะ)

## 6. Self-review

- Placeholder: ไม่มี TBD — variant, variables, คีย์ storage, testid ครบ
- Consistency: scope ทั้งระบบตรงกันทุก section, ไม่ขัด pastel (มีรุ่น dark ของมันเอง)
- Scope: ใหญ่แต่เป็นงาน mechanical เดียว (เติม dark:) พอแผนเดียวจบ แยก task ตามกลุ่มหน้า
- Ambiguity: ตารางแปลงสีล็อกไว้แล้ว ไม่ตีความสองแบบ
