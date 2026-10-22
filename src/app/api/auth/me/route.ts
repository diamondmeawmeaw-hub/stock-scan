import { route } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  // ตรวจกับฐานข้อมูลด้วย - token ที่ยังไม่หมดอายุของคนถูกปิดใช้งานต้องไม่ถือว่ายัง login
  return route(async () => ({ user: await getCurrentUser() }))
}
