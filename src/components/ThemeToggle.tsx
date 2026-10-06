'use client'

import { useEffect, useRef, useState } from 'react'
import { applyTheme, setStoredTheme, type ResolvedTheme } from '@/lib/theme'

/** ระยะเลื่อนลูกบิด (track w-12 - knob w-5 - ขอบ 2px สองข้าง) */
const TRAVEL_PX = 24
/** ลากน้อยกว่านี้นับเป็นกด */
const TAP_PX = 4

/**
 * สวิตช์โหมดมืดทรงกระจก (glassmorphism) - จับลากก็ได้ กดก็ได้
 * มืด = พระจันทร์ทอง, สว่าง = พระอาทิตย์ฟ้า
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ResolvedTheme>('light')
  const [mounted, setMounted] = useState(false)
  /** ตำแหน่งลูกบิดตอนกำลังลาก (null = ไม่ได้ลาก ใช้สถานะ theme) */
  const [dragX, setDragX] = useState<number | null>(null)
  const drag = useRef<{ startX: number; startDark: boolean; moved: boolean } | null>(null)
  /** ลากมาแล้วห้าม onClick ยิงซ้ำ (endDrag ทำงานก่อน click เสมอ) */
  const justDragged = useRef(false)

  useEffect(() => {
    setTheme(applyTheme())
    setMounted(true)
  }, [])

  const dark = theme === 'dark'

  function commit(next: ResolvedTheme) {
    setStoredTheme(next)
    setTheme(applyTheme(next))
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    drag.current = { startX: e.clientX, startDark: dark, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    if (Math.abs(dx) >= TAP_PX) d.moved = true
    const base = d.startDark ? TRAVEL_PX : 0
    setDragX(Math.min(TRAVEL_PX, Math.max(0, base + dx)))
    document.body.classList.add('toggle-dragging')
  }

  function endDrag(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current
    drag.current = null
    document.body.classList.remove('toggle-dragging')
    setDragX(null)
    if (!d || !d.moved) return
    // ลากมาแล้วให้ endDrag จัดการอย่างเดียว กัน onClick ที่ตามมายิงซ้ำ
    justDragged.current = true
    window.setTimeout(() => {
      justDragged.current = false
    }, 0)
    const dx = e.clientX - d.startX
    const endPos = (d.startDark ? TRAVEL_PX : 0) + dx
    const next: ResolvedTheme = endPos >= TRAVEL_PX / 2 ? 'dark' : 'light'
    if (next !== theme) commit(next)
  }

  function onClick() {
    // ลากมาแล้ว endDrag จัดการให้ - กันกดซ้ำ
    if (justDragged.current) {
      justDragged.current = false
      return
    }
    commit(dark ? 'light' : 'dark')
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      data-testid="theme-toggle"
      aria-label={dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
      title={dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
      className="relative ml-2 h-6 w-12 shrink-0 cursor-grab touch-none rounded-full border border-white/60 bg-white/50 shadow-[inset_0_2px_6px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.12)] backdrop-blur-md transition-colors duration-300 active:cursor-grabbing dark:border-white/15 dark:bg-white/10 dark:shadow-[inset_0_2px_6px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.4)]"
    >
      <span
        aria-hidden
        data-toggle-knob
        style={dragX !== null ? { transform: `translateX(${dragX}px)` } : undefined}
        className={`absolute top-0.5 left-0.5 flex h-5 w-5 items-center justify-center rounded-full transition-all duration-300 ${
          dragX === null && mounted ? (dark ? 'translate-x-6' : 'translate-x-0') : ''
        } ${
          dark
            ? 'bg-gradient-to-br from-amber-200 to-amber-500 shadow-[0_0_14px_rgba(245,158,11,0.8)]'
            : 'bg-gradient-to-br from-indigo-300 to-indigo-500 shadow-[0_0_14px_rgba(99,102,241,0.8)]'
        }`}
      >
        {mounted &&
          (dark ? (
            <svg viewBox="0 0 24 24" className="h-3 w-3 text-amber-950" fill="currentColor" aria-hidden>
              <path d="M21.4 14.5A9 9 0 0 1 9.5 2.6a.7.7 0 0 0-.9-.9 10.2 10.2 0 1 0 13.7 13.7.7.7 0 0 0-.9-.9Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ))}
      </span>
    </button>
  )
}
