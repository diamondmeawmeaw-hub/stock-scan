'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * ช่องค้นหา serial - รองรับทั้งพิมพ์เองและยิงด้วยเครื่องสแกน
 * เครื่องสแกนปิดท้ายด้วย Enter ซึ่ง submit ฟอร์มนี้พอดี จึงไม่ต้องดักคีย์เอง
 */
export function SerialSearchForm({ initial }: { initial: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initial)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm"
      data-testid="serial-search-form"
      onSubmit={(e) => {
        e.preventDefault()
        const q = value.trim()
        router.push(q ? `/serials?serial=${encodeURIComponent(q)}` : '/serials')
      }}
    >
      <div className="min-w-64 flex-1">
        <label className="label" htmlFor="serial-query">
          ยิงบาร์โค้ดหรือพิมพ์ serial
        </label>
        <input
          id="serial-query"
          ref={inputRef}
          data-testid="serial-query"
          className="w-full rounded-lg border-2 border-sky-200 bg-sky-50/50 px-4 py-3 font-mono text-xl tracking-wider outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/10"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="เช่น AP-0001"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <button
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-sky-700"
        data-testid="serial-search-submit"
      >
        <SearchIcon className="h-4 w-4" />
        ค้นหา
      </button>
      {initial && (
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-sky-50"
          data-testid="serial-search-clear"
          onClick={() => {
            setValue('')
            router.push('/serials')
            inputRef.current?.focus()
          }}
        >
          ล้าง
        </button>
      )}
    </form>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-5 w-5'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}
