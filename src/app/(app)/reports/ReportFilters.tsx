'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Values = {
  categoryId: string
  brand: string
  vendorId: string
  q: string
  from: string
  to: string
}

const fieldClass =
  'w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10'

export function ReportFilters({
  categories,
  brands,
  vendors,
  view,
  values,
}: {
  categories: { id: string; name: string }[]
  brands: string[]
  vendors: { id: string; code: string; name: string }[]
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
    if (view === 'movement') {
      query.set('from', next.from)
      query.set('to', next.to)
    }
    router.push(`/reports?${query}`)
  }

  return (
    <form
      className="grid gap-3 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
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
        <label className="label" htmlFor="filter-vendor">
          ผู้ขาย
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
          <div>
            <label className="label" htmlFor="filter-from">
              ตั้งแต่วันที่
            </label>
            <input
              id="filter-from"
              data-testid="filter-from"
              type="date"
              className={fieldClass}
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="filter-to">
              ถึงวันที่
            </label>
            <input
              id="filter-to"
              data-testid="filter-to"
              type="date"
              className={fieldClass}
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
          </div>
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
            const cleared = { ...form, categoryId: '', brand: '', vendorId: '', q: '' }
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