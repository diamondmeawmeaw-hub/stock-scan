import { redirect } from 'next/navigation'
import { MobileTabBar } from '@/components/MobileTabBar'
import { NavBar } from '@/components/NavBar'
import { getCurrentUser } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // ตรวจ user จากฐานข้อมูลทุกครั้ง ไม่ใช่แค่ลายเซ็น JWT - คนที่ถูกปิดใช้งาน
  // หรือถูกลดสิทธิ์ต้องหลุดจากหน้าเว็บทันที ไม่ต้องรอ token หมดอายุ
  const user = await getCurrentUser()
  if (!user) redirect('/login?reauth=1')

  return (
    <div className="min-h-dvh">
      <NavBar displayName={user.displayName} role={user.role} />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-6">
        {children}
      </main>
      <MobileTabBar displayName={user.displayName} role={user.role} />
    </div>
  )
}
