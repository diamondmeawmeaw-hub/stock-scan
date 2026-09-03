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
      className="card flex flex-wrap items-end gap-3 p-4"
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
          className="w-full rounded-lg border-2 border-slate-300 px-4 py-3 font-mono text-xl tracking-wider outline-none focus:border-slate-900"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="เช่น AP-0001"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <button className="btn-primary py-3" data-testid="serial-search-submit">
        ค้นหา
      </button>
      {initial && (
        <button
          type="button"
          className="btn-ghost py-3"
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
