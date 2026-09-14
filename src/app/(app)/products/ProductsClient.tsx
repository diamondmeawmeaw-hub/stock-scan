'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '@/lib/client'

type Product = {
  id: string
  sku: string
  name: string
  brand: string | null
  note: string | null
  categoryId: string
  categoryName: string
  trackingType: 'SERIAL' | 'QUANTITY'
  unitLabel: string | null
  inStock: number
}

type Category = { id: string; name: string }

/** หน่วยนับมาตรฐาน - กันสะกดมั่ว (ชิ้น/อัน/ใบ ปนกัน) ค่าเก่าที่เพี้ยนอยู่แล้วแสดงตามเดิม ไม่บังคับแก้ */
const UNIT_LABELS = ['ชิ้น', 'อัน', 'เครื่อง', 'กล่อง', 'เมตร', 'ม้วน', 'ชุด', 'ตู้', 'ใบ'] as const
const UNIT_CUSTOM = '__custom__'

function isStandardUnit(value: string): boolean {
  return (UNIT_LABELS as readonly string[]).includes(value)
}

export function ProductsClient({
  products,
  categories,
}: {
  products: Product[]
  categories: Category[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // ค้นหากรองตารางฝั่ง client - ไม่ยิง API (ของเยอะแล้วเลื่อนหาช้า)
  const [query, setQuery] = useState('')
  const filtered = query.trim()
    ? products.filter((p) => {
        const hay = `${p.sku} ${p.name} ${p.brand ?? ''} ${p.categoryName}`.toUpperCase()
        return query
          .trim()
          .toUpperCase()
          .split(/\s+/)
          .every((w) => hay.includes(w))
      })
    : products
  const [form, setForm] = useState({
    sku: '',
    name: '',
    brand: '',
    categoryId: categories[0]?.id ?? '',
    trackingType: 'SERIAL',
    unitLabel: 'ชิ้น',
  })
  const [edit, setEdit] = useState({
    sku: '',
    name: '',
    brand: '',
    categoryId: '',
    trackingType: 'SERIAL',
    unitLabel: '',
  })
  // true = กำลังพิมพ์หน่วยนับเอง (ฟอร์มสร้าง / ฟอร์มแก้ไข แยกกัน)
  const [customUnit, setCustomUnit] = useState(false)
  const [customEditUnit, setCustomEditUnit] = useState(false)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    if (form.trackingType === 'QUANTITY' && customUnit && !form.unitLabel.trim()) {
      setError('พิมพ์หน่วยนับเอง (1–20 ตัวอักษร) หรือเลือกจากรายการ')
      return
    }
    void run(async () => {
      await api('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          unitLabel: form.trackingType === 'QUANTITY' ? form.unitLabel.trim() || 'ชิ้น' : null,
        }),
      })
      setForm({
        sku: '',
        name: '',
        brand: '',
        categoryId: categories[0]?.id ?? '',
        trackingType: 'SERIAL',
        unitLabel: 'ชิ้น',
      })
      setCustomUnit(false)
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">สินค้า</h1>
        <p className="text-sm text-slate-500">
          แบบรายชิ้นยิง serial ทีละชิ้น · แบบจำนวนกรอกตัวเลข · {products.length} รายการ
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={create} className="card grid gap-3 p-4 sm:grid-cols-5" data-testid="product-form">
        <div>
          <label className="label" htmlFor="sku">
            รหัสสินค้า (SKU)
          </label>
          <input
            id="sku"
            className="field"
            required
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">
            ชื่อสินค้า
          </label>
          <input
            id="name"
            className="field"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="brand">
            แบรนด์
          </label>
          <input
            id="brand"
            className="field"
            placeholder="เช่น UniFi"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="category">
            ประเภทของ
          </label>
          <div className="flex gap-2">
            <select
              id="category"
              className="field"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className="btn-primary shrink-0" disabled={busy || categories.length === 0}>
              เพิ่ม
            </button>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="tracking">
            วิธีนับสต็อก
          </label>
          <select
            id="tracking"
            className="field"
            value={form.trackingType}
            onChange={(e) => setForm({ ...form, trackingType: e.target.value })}
          >
            <option value="SERIAL">รายชิ้น (ยิง serial)</option>
            <option value="QUANTITY">นับจำนวน (กรอกตัวเลข)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="unit">
            หน่วยนับ
          </label>
          <select
            id="unit"
            data-testid="unit-select"
            className="field"
            disabled={form.trackingType !== 'QUANTITY'}
            value={customUnit ? UNIT_CUSTOM : isStandardUnit(form.unitLabel) ? form.unitLabel : UNIT_CUSTOM}
            onChange={(e) => {
              if (e.target.value === UNIT_CUSTOM) {
                setCustomUnit(true)
                setForm({ ...form, unitLabel: '' })
              } else {
                setCustomUnit(false)
                setForm({ ...form, unitLabel: e.target.value })
              }
            }}
          >
            {UNIT_LABELS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
            <option value={UNIT_CUSTOM}>อื่นๆ (พิมพ์เอง)</option>
          </select>
          {customUnit && form.trackingType === 'QUANTITY' && (
            <input
              data-testid="unit-custom"
              className="field mt-1"
              placeholder="เช่น ลัง, แพ็ก (1–20 ตัวอักษร)"
              maxLength={20}
              required
              value={form.unitLabel}
              onChange={(e) => setForm({ ...form, unitLabel: e.target.value })}
            />
          )}
        </div>
      </form>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <input
            data-testid="product-search"
            className="field"
            placeholder="ค้นหา SKU / ชื่อ / แบรนด์ / ประเภท..."
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() && (
            <p className="mt-1 text-xs text-slate-500">
              เจอ {filtered.length} จาก {products.length} รายการ
            </p>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">ชื่อสินค้า</th>
              <th className="px-4 py-2 font-medium">แบรนด์</th>
              <th className="px-4 py-2 font-medium">ประเภทของ</th>
              <th className="px-4 py-2 font-medium">วิธีนับ</th>
              <th className="px-4 py-2 font-medium">คงเหลือ</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-slate-500">
                  ยังไม่มีสินค้า
                </td>
              </tr>
            )}
            {products.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-slate-500" data-testid="product-empty">
                  ไม่พบสินค้าที่ตรงกับคำค้น
                </td>
              </tr>
            )}
            {filtered.map((p) =>
              editingId === p.id ? (
                <tr key={p.id} className="bg-slate-50">
                  <td className="px-4 py-2">
                    <input
                      className="field"
                      value={edit.sku}
                      onChange={(e) => setEdit({ ...edit, sku: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className="field"
                      value={edit.name}
                      onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className="field"
                      value={edit.brand}
                      onChange={(e) => setEdit({ ...edit, brand: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="field"
                      value={edit.categoryId}
                      onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="field"
                      value={edit.trackingType}
                      onChange={(e) => setEdit({ ...edit, trackingType: e.target.value })}
                    >
                      <option value="SERIAL">รายชิ้น</option>
                      <option value="QUANTITY">จำนวน</option>
                    </select>
                    {edit.trackingType === 'QUANTITY' && (
                      <>
                        <select
                          className="field mt-1"
                          data-testid="unit-edit-select"
                          value={
                            customEditUnit
                              ? UNIT_CUSTOM
                              : isStandardUnit(edit.unitLabel)
                                ? edit.unitLabel
                                : UNIT_CUSTOM
                          }
                          onChange={(e) => {
                            if (e.target.value === UNIT_CUSTOM) {
                              setCustomEditUnit(true)
                              setEdit({ ...edit, unitLabel: '' })
                            } else {
                              setCustomEditUnit(false)
                              setEdit({ ...edit, unitLabel: e.target.value })
                            }
                          }}
                        >
                          {UNIT_LABELS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                          <option value={UNIT_CUSTOM}>อื่นๆ (พิมพ์เอง)</option>
                        </select>
                        {(customEditUnit || !isStandardUnit(edit.unitLabel)) && (
                          <input
                            className="field mt-1"
                            data-testid="unit-edit-custom"
                            placeholder="หน่วยนับเอง (1–20 ตัวอักษร)"
                            maxLength={20}
                            value={edit.unitLabel}
                            onChange={(e) => {
                              setCustomEditUnit(true)
                              setEdit({ ...edit, unitLabel: e.target.value })
                            }}
                          />
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2">{p.inStock}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      className="btn-primary mr-2"
                      disabled={busy}
                      onClick={() => {
                        if (edit.trackingType === 'QUANTITY' && customEditUnit && !edit.unitLabel.trim()) {
                          setError('พิมพ์หน่วยนับเอง (1–20 ตัวอักษร) หรือเลือกจากรายการ')
                          return
                        }
                        void run(async () => {
                          await api(`/api/products/${p.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify(edit),
                          })
                          setEditingId(null)
                          setCustomEditUnit(false)
                        })
                      }}
                    >
                      บันทึก
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => {
                        setEditingId(null)
                        setCustomEditUnit(false)
                      }}
                    >
                      ยกเลิก
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-mono">{p.sku}</td>
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2 text-slate-600">{p.brand ?? '-'}</td>
                  <td className="px-4 py-2 text-slate-600">{p.categoryName}</td>
                  <td className="px-4 py-2">
                    {p.trackingType === 'QUANTITY' ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                        จำนวน{p.unitLabel ? ` (${p.unitLabel})` : ''}
                      </span>
                    ) : (
                      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">
                        รายชิ้น
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {p.inStock}
                    {p.trackingType === 'QUANTITY' && (
                      <span className="ml-1 text-xs text-slate-500">{p.unitLabel ?? ''}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      className="btn-ghost mr-2"
                      onClick={() => {
                        setEditingId(p.id)
                        setCustomEditUnit(!isStandardUnit(p.unitLabel ?? 'ชิ้น'))
                        setEdit({
                          sku: p.sku,
                          name: p.name,
                          brand: p.brand ?? '',
                          categoryId: p.categoryId,
                          trackingType: p.trackingType,
                          unitLabel: p.unitLabel ?? '',
                        })
                      }}
                    >
                      แก้ไข
                    </button>
                    <button
                      className="btn-danger"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`ลบสินค้า "${p.name}" ?`)) return
                        void run(() => api(`/api/products/${p.id}`, { method: 'DELETE' }))
                      }}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
