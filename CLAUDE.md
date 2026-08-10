# Stock Scan System

ระบบเช็คสต็อกสินค้าด้วยการสแกน serial

## บริบท
- ใช้เครื่องสแกนบาร์โค้ด USB/บลูทูธ (HID keyboard emulation - พิมพ์ตัวอักษรแล้วตามด้วย Enter)
- ทีมใช้งาน 2-10 คน คลังเดียว ต้องมีระบบ login/user
- เทสในเครื่องตัวเองก่อน ทีหลังจะย้ายไปรันบน NAS ผ่าน Docker

## Tech Stack
- Next.js (frontend + API routes)
- PostgreSQL รันผ่าน Docker Compose
- Prisma ORM
- Auth แบบง่าย (username/password, role admin/staff)

## ฟีเจอร์หลัก
1. จัดการสินค้า/ประเภทของ (CRUD) - ประเภทของแบบอุปกรณ์เน็ตเวิร์ค เช่น AP, Switch, กล้อง, สายแลน
2. หน้าสแกนรับเข้าสต็อก (scan-in)
3. หน้าสแกนเบิกออก (scan-out)
4. หน้าตรวจนับสต็อก (audit) - เทียบของที่สแกนกับที่ระบบควรมี บอกของหาย/เกิน
5. รายงานคงเหลือแยกตามประเภทของ

## ต้องมี
- Docker Compose รันได้ด้วย `docker-compose up` ตัวเดียวจบ
- Prisma schema: Category, Product, SerialUnit, ScanLog, User
- เทส: unit test (Vitest), integration test สำหรับ API สแกน, E2E (Playwright) จำลองพิมพ์เร็วตามด้วย Enter