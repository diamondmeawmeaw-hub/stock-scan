# Stock Scan

ระบบจัดการสต็อกสินค้าและการสแกน (Stock Scanning System) พัฒนาด้วย Next.js, Prisma และ PostgreSQL

## คุณสมบัติหลัก

- **Scan In / Scan Out** — บันทึกรับเข้า/จ่ายออกสินค้าด้วยการสแกน
- **Audit** — ตรวจนับสต็อกและตรวจสอบความถูกต้องของสินค้า
- **Products & Categories** — จัดการรายการสินค้าและหมวดหมู่
- **Vendors** — จัดการข้อมูลผู้จำหน่าย
- **Serial Tracking** — ติดตามสินค้าตาม Serial Number
- **Reports** — ออกรายงานสต็อกและความเคลื่อนไหว (export เป็น Excel/PDF)
- **User Management** — ระบบจัดการผู้ใช้งานและสิทธิ์การเข้าถึง

## Tech Stack

- **Framework:** Next.js
- **Database:** PostgreSQL + Prisma ORM
- **Testing:** Vitest (unit/integration), Playwright (E2E)
- **Deployment:** Docker / Docker Compose

## เริ่มต้นใช้งาน

### ข้อกำหนดเบื้องต้น

- Node.js
- Docker และ Docker Compose (สำหรับรัน PostgreSQL)

### ติดตั้ง

```bash
# ติดตั้ง dependencies
npm install

# คัดลอกไฟล์ environment variables
cp .env.example .env
# แก้ไขค่าใน .env ให้ตรงกับenvironmentของคุณ

# รัน database ผ่าน Docker
docker-compose up -d

# รัน migration
npx prisma migrate dev

# (ถ้ามี) seed ข้อมูลตั้งต้น
npx prisma db seed
```

### รันโปรเจค

```bash
npm run dev
```

เปิดเบราว์เซอร์ไปที่ [http://localhost:3000](http://localhost:3000)

demo:https://stock-scan-alpha.vercel.app/

## การทดสอบ

```bash
# Unit / Integration tests
npm run test

# E2E tests (Playwright)
npm run test:e2e
```

## โครงสร้างโปรเจค

```
├── docker/           # Docker configuration files
├── prisma/           # Database schema และ migrations
├── scripts/          # Utility scripts
├── src/
│   ├── app/          # Next.js App Router (pages & API routes)
│   ├── components/   # React components
│   └── lib/          # Shared utilities และ business logic
└── tests/            # Unit, integration และ E2E tests
```


