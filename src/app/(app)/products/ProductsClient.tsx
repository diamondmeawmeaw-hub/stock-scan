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
  inStock: number
}

type Category = { id: string; name: string }

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
  const [form, setForm] = useState({ sku: '', name: '', brand: '', categoryId: categories[0]?.id ?? '' })
  const [edit, setEdit] = useState({ sku: '', name: '', brand: '', categoryId: '' })

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
    void run(async () => {
      await api('/api/products', { method: 'POST', body: JSON.stringify(form) })
      setForm({ sku: '', name: '', brand: '', categoryId: categories[0]?.id ?? '' })
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">สินค้า</h1>
        <p className="text-sm text-slate-500">
          สินค้า 1 รายการมี serial ได้หลายชิ้น · {products.length} รายการ
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
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">ชื่อสินค้า</th>
              <th className="px-4 py-2 font-medium">แบรนด์</th>
              <th className="px-4 py-2 font-medium">ประเภทของ</th>
              <th className="px-4 py-2 font-medium">คงเหลือ</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-slate-500">
                  ยังไม่มีสินค้า
                </td>
              </tr>
            )}
            {products.map((p) =>
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
                  <td className="px-4 py-2">{p.inStock}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      className="btn-primary mr-2"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(`/api/products/${p.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify(edit),
                          })
                          setEditingId(null)
                        })
                      }
                    >
                      บันทึก
                    </button>
                    <button className="btn-ghost" onClick={() => setEditingId(null)}>
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
                  <td className="px-4 py-2">{p.inStock}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      className="btn-ghost mr-2"
                      onClick={() => {
                        setEditingId(p.id)
                        setEdit({ sku: p.sku, name: p.name, brand: p.brand ?? '', categoryId: p.categoryId })
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
