'use client'

import { useEffect, useState } from 'react'
import { applyTheme, setStoredTheme, type ResolvedTheme } from '@/lib/theme'

/**
 * สวิตช์โหมดมืดทรงกระจก (glassmorphism) - รางโปร่งแสง ลูกบิดเลื่อนพร้อมแสงเรือง
 * มืด = พระจันทร์ทอง, สว่าง = พระอาทิตย์ฟ้า
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ResolvedTheme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setTheme(applyTheme())
    setMounted(true)
  }, [])

  function toggle() {
    const next: ResolvedTheme = theme === 'dark' ? 'light' : 'dark'
    setStoredTheme(next)
    setTheme(applyTheme(next))
  }

  const dark = theme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
      title={dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
      className="relative h-8 w-16 shrink-0 rounded-full border border-white/60 bg-white/50 shadow-[inset_0_2px_6px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.12)] backdrop-blur-md transition-colors duration-300 dark:border-white/15 dark:bg-white/10 dark:shadow-[inset_0_2px_6px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.4)]"
    >
      <span
        aria-hidden
        className={`absolute top-1 left-1 flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 ${
          mounted ? (dark ? 'translate-x-8' : 'translate-x-0') : ''
        } ${
          dark
            ? 'bg-gradient-to-br from-amber-200 to-amber-500 shadow-[0_0_14px_rgba(245,158,11,0.8)]'
            : 'bg-gradient-to-br from-indigo-300 to-indigo-500 shadow-[0_0_14px_rgba(99,102,241,0.8)]'
        }`}
      >
        {mounted &&
          (dark ? (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-amber-950" fill="currentColor" aria-hidden>
              <path d="M21.4 14.5A9 9 0 0 1 9.5 2.6a.7.7 0 0 0-.9-.9 10.2 10.2 0 1 0 13.7 13.7.7.7 0 0 0-.9-.9Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ))}
      </span>
    </button>
  )
}
