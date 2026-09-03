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
      className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
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
          className="field"
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
          className="field"
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
          className="field"
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
          className="field"
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
              className="field"
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
              className="field"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
          </div>
        </>
      )}

      <div className="flex items-end gap-2">
        <button className="btn-primary" data-testid="apply-filters">
          ดูรายงาน
        </button>
        <button
          type="button"
          className="btn-ghost"
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
