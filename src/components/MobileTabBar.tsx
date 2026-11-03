'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MANAGE_LINKS, PRIMARY_LINKS, SECONDARY_LINKS, isActive } from '@/lib/nav-links'

/** ไอคอนเส้นบาง 24px - วาดเองเลี่ยงเพิ่ม dependency */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const TAB_ICONS: Record<string, ReactNode> = {
  '/': (
    <Icon>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V21h13V9.5" />
    </Icon>
  ),
  '/scan-in': (
    <Icon>
      <path d="M12 3v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 21h16" />
    </Icon>
  ),
  '/scan-out': (
    <Icon>
      <path d="M12 14V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M4 21h16" />
    </Icon>
  ),
  '/audit': (
    <Icon>
      <path d="M9 4h6l1 2h3v15H5V6h3l1-2Z" />
      <path d="m9 13 2 2 4-4" />
    </Icon>
  ),
}

const MORE_ICON = (
  <Icon>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
)

const MORE_PREFIXES = [...SECONDARY_LINKS, ...MANAGE_LINKS].map((link) => link.href)

/**
 * แถบเมนูล่างสำหรับมือถือ + bottom sheet "เพิ่มเติม"
 * - แท็บหลัก 4 ตัวอยู่ชิดนิ้วโป้ง ไม่ต้องละมือจากของที่สแกน
 * - เมนูรอง/จัดการข้อมูล/ออกจากระบบ อยู่ในชีตที่เลื่อนปิดได้
 * - จอ >= sm ซ่อนทั้งหมด (ใช้ NavBar ด้านบนแทน)
 */
export function MobileTabBar({
  displayName,
  role,
}: {
  displayName: string
  role: 'ADMIN' | 'STAFF'
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  const moreActive = MORE_PREFIXES.some((href) => isActive(pathname, href))
  const manageLinks = MANAGE_LINKS.filter((link) => !link.adminOnly || role === 'ADMIN')

  // เปลี่ยนหน้าแล้วหุบชีตเอง
  useEffect(() => setOpen(false), [pathname])

  // ล็อกการเลื่อนพื้นหลังตอนชีตเปิด
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Esc ปิด + โฟกัสปุ่มปิดตอนเปิด
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <>
      <nav
        aria-label="เมนูหลัก (มือถือ)"
        data-testid="mobile-tab-bar"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-950/95"
      >
        <div className="mx-auto flex max-w-6xl">
          {PRIMARY_LINKS.map((link) => {
            const active = isActive(pathname, link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'text-sky-700 dark:text-sky-300'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                    active ? 'bg-sky-100 dark:bg-sky-950' : ''
                  }`}
                >
                  {TAB_ICONS[link.href]}
                </span>
                <span className="max-w-full truncate">{link.label}</span>
              </Link>
            )
          })}

          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-current={moreActive ? 'page' : undefined}
            onClick={() => setOpen(true)}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors ${
              moreActive || open
                ? 'text-sky-700 dark:text-sky-300'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span
              className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                moreActive || open ? 'bg-sky-100 dark:bg-sky-950' : ''
              }`}
            >
              {MORE_ICON}
            </span>
            <span className="max-w-full truncate">เพิ่มเติม</span>
          </button>
        </div>
      </nav>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="เมนูเพิ่มเติม"
          data-testid="more-sheet"
          className="fixed inset-0 z-50 lg:hidden"
        >
          <button
            type="button"
            aria-label="ปิดเมนูเพิ่มเติม"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/50"
          />
          <div className="sheet-up absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {role === 'ADMIN' ? 'ผู้ดูแล' : 'พนักงาน'}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                aria-label="ปิด"
                onClick={() => setOpen(false)}
                className="btn-ghost h-11 w-11 shrink-0 px-0 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
              <section aria-label="ค้นหาและรายงาน">
                <p className="mb-1 px-1 text-xs font-semibold text-slate-400 dark:text-slate-500">
                  ค้นหา / รายงาน
                </p>
                <SheetLinks pathname={pathname} links={SECONDARY_LINKS} onNavigate={() => setOpen(false)} />
              </section>

              <section aria-label="จัดการข้อมูล">
                <p className="mb-1 px-1 text-xs font-semibold text-slate-400 dark:text-slate-500">
                  จัดการข้อมูล
                </p>
                <SheetLinks pathname={pathname} links={manageLinks} onNavigate={() => setOpen(false)} />
              </section>

              <button
                type="button"
                onClick={logout}
                className="btn-danger w-full py-3 text-sm"
              >
                ออกจากระบบ
              </button>
              <p className="pb-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
                Stock Scan · ระบบเช็คสต็อกด้วยการสแกน
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function SheetLinks({
  pathname,
  links,
  onNavigate,
}: {
  pathname: string
  links: { href: string; label: string }[]
  onNavigate: () => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {links.map((link) => {
        const active = isActive(pathname, link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm font-medium transition-colors last:border-b-0 active:bg-slate-100 dark:border-slate-800 dark:active:bg-slate-800 ${
              active
                ? 'bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            {link.label}
            <span aria-hidden className="text-slate-400 dark:text-slate-500">
              ›
            </span>
          </Link>
        )
      })}
    </div>
  )
}
