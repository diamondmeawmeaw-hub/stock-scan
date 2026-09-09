'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

type Values = {
  customerId: string
  q: string
  from: string
  to: string
}

const fieldClass =
  'w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10'

function toDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function DatePicker({
  id,
  testId,
  label,
  value,
  onChange,
}: {
  id: string
  testId: string
  label: string
  value: string
  onChange: (iso: string) => void
}) {
  const hiddenRef = useRef<HTMLInputElement>(null)

  function handleOpenPicker() {
    try {
      hiddenRef.current?.showPicker?.()
    } catch {
      // fallback: browser may block showPicker outside user gesture
    }
  }

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          data-testid={testId}
          type="text"
          readOnly
          className={`${fieldClass} pr-10 cursor-pointer`}
          value={toDisplay(value)}
          placeholder="dd/mm/yyyy"
          onClick={handleOpenPicker}
        />
        <button
          type="button"
          tabIndex={-1}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          onClick={handleOpenPicker}
        >
          <CalendarIcon className="h-4 w-4" />
        </button>
        <input
          ref={hiddenRef}
          type="date"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  )
}

export function SalesFilters({
  customers,
  values,
}: {
  customers: { id: string; code: string; name: string }[]
  values: Values
}) {
  const router = useRouter()
  const [form, setForm] = useState(values)

  function apply(next: Values) {
    const query = new URLSearchParams()
    if (next.customerId) query.set('customerId', next.customerId)
    if (next.q.trim()) query.set('q', next.q.trim())
    if (next.from) query.set('from', next.from)
    if (next.to) query.set('to', next.to)
    router.push(`/sales${query.toString() ? `?${query}` : ''}`)
  }

  return (
    <form
      className="grid gap-3 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
      data-testid="sales-filters"
      onSubmit={(e) => {
        e.preventDefault()
        apply(form)
      }}
    >
      <div>
        <label className="label" htmlFor="filter-customer">
          ลูกค้า
        </label>
        <select
          id="filter-customer"
          data-testid="filter-customer"
          className={fieldClass}
          value={form.customerId}
          onChange={(e) => setForm({ ...form, customerId: e.target.value })}
        >
          <option value="">ทุกลูกค้า</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="filter-q">
          ค้นหา
        </label>
        <input
          id="filter-q"
          data-testid="filter-q"
          className={fieldClass}
          placeholder="ชื่อลูกค้า, สินค้า, SKU, Serial"
          value={form.q}
          onChange={(e) => setForm({ ...form, q: e.target.value })}
        />
      </div>

      <DatePicker
        id="filter-from"
        testId="filter-from"
        label="ตั้งแต่วันที่"
        value={form.from}
        onChange={(v) => setForm({ ...form, from: v })}
      />

      <DatePicker
        id="filter-to"
        testId="filter-to"
        label="ถึงวันที่"
        value={form.to}
        onChange={(v) => setForm({ ...form, to: v })}
      />

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
          data-testid="apply-filters"
        >
          ค้นหา
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-sky-50"
          data-testid="clear-filters"
          onClick={() => {
            const cleared = { customerId: '', q: '', from: '', to: '' }
            setForm(cleared)
            apply(cleared)
          }}
        >
          ล้างตัวกรอง
        </button>
      </div>
    </form>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-4 w-4'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  )
}
