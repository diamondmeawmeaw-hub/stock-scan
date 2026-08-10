/**
 * สร้างผู้ดูแลระบบคนแรกตอน deploy ครั้งแรกเท่านั้น - ถ้ามี user อยู่แล้วจะไม่ทำอะไร
 * รหัสผ่านมาจาก ADMIN_PASSWORD ไม่มีค่า default เพราะรหัสตายตัวใน repo
 * เท่ากับเปิดประตูทิ้งไว้บนเครื่องที่ deploy จริง
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const MIN_PASSWORD_LENGTH = 8

async function main() {
  const existing = await prisma.user.count()
  if (existing > 0) {
    console.log(`[bootstrap-admin] มีผู้ใช้อยู่แล้ว ${existing} คน - ข้ามการสร้าง`)
    return
  }

  const username = (process.env.ADMIN_USERNAME ?? 'admin').trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `ยังไม่มีผู้ใช้ในระบบ และ ADMIN_PASSWORD ไม่ถูกตั้งค่า (ต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัว)\n` +
        'ตั้งค่าใน .env แล้วสตาร์ทใหม่ เช่น ADMIN_PASSWORD=<รหัสที่ตั้งเอง>'
    )
  }

  await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 10),
      displayName: process.env.ADMIN_DISPLAY_NAME ?? 'ผู้ดูแลระบบ',
      role: 'ADMIN',
    },
  })

  console.log(`[bootstrap-admin] สร้างผู้ดูแลระบบ "${username}" แล้ว - เข้าระบบแล้วเปลี่ยนรหัสทันที`)
}

main()
  .catch((e) => {
    console.error(`[bootstrap-admin] ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
