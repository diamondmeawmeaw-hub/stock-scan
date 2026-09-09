'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { TIME_PERIOD_OPTIONS, type TimePeriod } from '@/lib/date-range'

type Values = {
  categoryId: string
  brand: string
  vendorId: string
  q: string
  customerId: string
  timePeriod: string
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

function toISO(display: string): string {
  const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return ''
  const [, d, m, y] = match
  return `${y}-${m}-${d}`
}

function DatePicker({
  id,
  label,
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
}: {
  id: string
  label: string
  value: string
  onChange: (iso: string) => void
  placeholder?: string
}) {
  const hiddenRef = useRef<HTMLInputElement>(null)
  const [display, setDisplay] = useState(toDisplay(value))

  function handleOpenPicker() {
    try {
      hiddenRef.current?.showPicker()
    } catch {
      // showPicker() blocked by browser — user can still type
    }
  }

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setDisplay(text)
    const iso = toISO(text)
    if (iso) onChange(iso)
  }

  function handleCalendarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const iso = e.target.value
    onChange(iso)
    setDisplay(toDisplay(iso))
  }

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          ref={hiddenRef}
          type="date"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          value={value}
          onChange={handleCalendarChange}
        />
        <input
          id={id}
          data-testid={id}
          type="text"
          placeholder={placeholder}
          className={`${fieldClass} pr-8`}
          value={display}
          onFocus={handleOpenPicker}
          onChange={handleTextChange}
        />
      </div>
    </div>
  )
}

export function ReportFilters({
  categories,
  brands,
  vendors,
  customers,
  view,
  values,
}: {
  categories: { id: string; name: string }[]
  brands: string[]
  vendors: { id: string; code: string; name: string }[]
  customers: { id: string; code: string; name: string }[]
  view: 'stock' | 'movement'
  values: Values
}) {
  const router = useRouter()
  const [form, setForm] = useState(values)

  function apply(next: Values) {
    const query = new URLSearchParams()
    query.set('view', view)
    if (next.categoryId) query.set('categoryId', next.categoryId)
    if (next.brand) query.set('brand', next.brand)
    if (next.vendorId) query.set('vendorId', next.vendorId)
    if (next.q.trim()) query.set('q', next.q.trim())
    if (next.customerId) query.set('customerId', next.customerId)
    if (next.timePeriod && next.timePeriod !== '30d') query.set('timePeriod', next.timePeriod)
    if (view === 'movement') {
      query.set('from', next.from)
      query.set('to', next.to)
    }
    router.push(`/reports?${query}`)
  }

  return (
    <form
      className="grid gap-3 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
      data-testid="report-filters"
      onSubmit={(e) => {
        e.preventDefault()
        apply(form)
      }}
    >
      <div>
        <label className="label" htmlFor="filter-q">
          ค้นหาชื่อ / SKU / แบรนด์
        </label>
        <input
          id="filter-q"
          data-testid="filter-q"
          className={fieldClass}
          placeholder="เช่น UniFi, กล้อง, CAM-"
          value={form.q}
          onChange={(e) => setForm({ ...form, q: e.target.value })}
        />
      </div>

      <div>
        <label className="label" htmlFor="filter-category">
          ประเภทของ
        </label>
        <select
          id="filter-category"
          data-testid="filter-category"
          className={fieldClass}
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
        >
          <option value="">ทุกประเภท</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="filter-brand">
          แบรนด์
        </label>
        <select
          id="filter-brand"
          data-testid="filter-brand"
          className={fieldClass}
          value={form.brand}
          onChange={(e) => setForm({ ...form, brand: e.target.value })}
        >
          <option value="">ทุกแบรนด์</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

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
          <option value="">ทั้งหมด</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
      </div>

      {view === 'stock' && (
        <div>
          <label className="label" htmlFor="filter-time-period">
            ช่วงเวลา
          </label>
          <select
            id="filter-time-period"
            data-testid="filter-time-period"
            className={fieldClass}
            value={form.timePeriod}
            onChange={(e) => setForm({ ...form, timePeriod: e.target.value })}
          >
            {TIME_PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label" htmlFor="filter-vendor">
          ซื้อจาก
        </label>
        <select
          id="filter-vendor"
          data-testid="filter-vendor"
          className={fieldClass}
          value={form.vendorId}
          onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
        >
          <option value="">ทุกผู้ขาย</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.code} · {v.name}
            </option>
          ))}
        </select>
      </div>

      {view === 'movement' && (
        <>
          <DatePicker
            id="filter-from"
            label="ตั้งแต่วันที่"
            value={form.from}
            onChange={(iso) => setForm({ ...form, from: iso })}
          />
          <DatePicker
            id="filter-to"
            label="ถึงวันที่"
            value={form.to}
            onChange={(iso) => setForm({ ...form, to: iso })}
          />
        </>
      )}

      <div className="flex items-end gap-2">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
          data-testid="apply-filters"
        >
          ดูรายงาน
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-sky-50"
          data-testid="clear-filters"
          onClick={() => {
            const cleared = { ...form, categoryId: '', brand: '', vendorId: '', q: '', customerId: '', timePeriod: '30d' }
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
