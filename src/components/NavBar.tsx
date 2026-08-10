'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const LINKS = [
  { href: '/', label: 'หน้าหลัก' },
  { href: '/scan-in', label: 'รับเข้า' },
  { href: '/scan-out', label: 'เบิกออก' },
  { href: '/audit', label: 'ตรวจนับ' },
  { href: '/serials', label: 'ค้นหา Serial' },
  { href: '/reports', label: 'รายงาน' },
]

const MANAGE_LINKS = [
  { href: '/products', label: 'สินค้า' },
  { href: '/categories', label: 'ประเภทของ' },
  { href: '/vendors', label: 'ผู้ขาย' },
  { href: '/users', label: 'ผู้ใช้', adminOnly: true },
]

const isActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname.startsWith(href)

const linkClass = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
    active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
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
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3">
        <span className="mr-4 text-base font-semibold tracking-tight">Stock&nbsp;Scan</span>
        <nav className="flex flex-wrap items-center gap-1">
          {LINKS.map((link) => (
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
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-slate-500">
            {displayName}
            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
              {role === 'ADMIN' ? 'ผู้ดูแล' : 'พนักงาน'}
            </span>
          </span>
          <button onClick={logout} className="btn-ghost px-3 py-1.5">
            ออกจากระบบ
          </button>
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
          className="absolute left-0 top-full z-20 mt-1 min-w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              role="menuitem"
              className={`block px-3 py-1.5 text-sm font-medium transition ${
                isActive(pathname, link.href)
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50'
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
