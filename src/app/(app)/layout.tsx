import { redirect } from 'next/navigation'
import { NavBar } from '@/components/NavBar'
import { getSession } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen">
      <NavBar displayName={session.displayName} role={session.role} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
