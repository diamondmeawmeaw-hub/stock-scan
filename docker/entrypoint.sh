#!/bin/sh
# รัน migration แล้วสตาร์ท Next.js
# ไม่ seed ข้อมูลตัวอย่างที่นี่ - แค่สร้างผู้ดูแลระบบคนแรกถ้าฐานข้อมูลยังว่าง
set -e

echo "[entrypoint] applying database migrations..."
npx prisma migrate deploy

# ล้มแล้วต้องหยุด ไม่กลบ error เพราะถ้าไม่มี admin ก็เข้าระบบไม่ได้อยู่ดี
echo "[entrypoint] ensuring an admin account exists..."
npx tsx prisma/bootstrap-admin.ts

echo "[entrypoint] starting app..."
exec "$@"
