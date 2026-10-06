'use client'

import { useEffect, useState } from 'react'
import { applyTheme, setStoredTheme, type ResolvedTheme } from '@/lib/theme'

/** สวิตช์โหมดมืด - จำค่าลง localStorage ครั้งแรกตามเครื่อง */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ResolvedTheme>('light')

  useEffect(() => {
    setTheme(applyTheme())
  }, [])

  function toggle() {
    const next: ResolvedTheme = theme === 'dark' ? 'light' : 'dark'
    setStoredTheme(next)
    setTheme(applyTheme(next))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
      title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-base transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <span aria-hidden>{theme === 'dark' ? '☀' : '🌙'}</span>
    </button>
  )
}
