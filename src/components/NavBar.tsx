'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { MANAGE_LINKS, MAIN_LINKS, isActive } from '@/lib/nav-links'
import { ThemeToggle } from './ThemeToggle'

const linkClass = (active: boolean) =>
  `shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
    active
      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`

export function NavBar({ displayName, role }: { displayName: string; role: 'ADMIN' | 'STAFF' }) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white pt-[env(safe-area-inset-top)] transition-colors duration-500 ease-in-out lg:static dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex max-w-6xl items-center gap-x-3 px-4 py-2 sm:py-3">
        <Link
          href="/"
          className="shrink-0 rounded-lg text-base font-semibold tracking-tight"
          aria-label="Stock Scan - หน้าหลัก"
        >
          Stock&nbsp;Scan
        </Link>
        {/* จอใหญ่เท่านั้น - มือถือใช้ MobileTabBar ด้านล่าง */}
        <nav aria-label="เมนูหลัก" className="hidden items-center gap-1 lg:flex">
          {MAIN_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={linkClass(isActive(pathname, link.href))}
            >
              {link.label}
            </Link>
          ))}
          <ManageMenu pathname={pathname} role={role} />
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="hidden text-slate-500 sm:inline dark:text-slate-400">
            {displayName}
            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {role === 'ADMIN' ? 'ผู้ดูแล' : 'พนักงาน'}
            </span>
          </span>
          <button
            onClick={logout}
            className="btn-ghost hidden px-3 py-1.5 text-sm sm:inline-flex"
          >
            ออกจากระบบ
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

function ManageMenu({ pathname, role }: { pathname: string; role: 'ADMIN' | 'STAFF' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const links = MANAGE_LINKS.filter((link) => !link.adminOnly || role === 'ADMIN')
  const active = links.some((link) => isActive(pathname, link.href))

  // ปิดเมนูเมื่อคลิกที่อื่นหรือกด Esc
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // เปลี่ยนหน้าแล้วเมนูต้องหุบเอง
  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-testid="manage-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${linkClass(active)} flex items-center gap-1`}
      >
        จัดการข้อมูล
        <span aria-hidden className={`inline-block text-xs transition ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          data-testid="manage-menu-items"
          className="absolute right-0 top-full z-20 mt-1 min-w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg sm:right-auto sm:left-0 dark:border-slate-700 dark:bg-slate-900"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              role="menuitem"
              className={`block px-3 py-1.5 text-sm font-medium transition ${
                isActive(pathname, link.href)
                  ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
