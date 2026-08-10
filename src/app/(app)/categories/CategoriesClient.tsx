'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '@/lib/client'

type Category = { id: string; code: string; name: string; productCount: number }

export function CategoriesClient({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ code: '', name: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ code: '', name: '' })

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">ประเภทของ</h1>
        <p className="text-sm text-slate-500">
          ใช้จัดกลุ่มสินค้า และใช้เป็นขอบเขตตอนตรวจนับ · {categories.length} ประเภท
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form
        data-testid="category-form"
        className="card grid gap-3 p-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            await api('/api/categories', { method: 'POST', body: JSON.stringify(form) })
            setForm({ code: '', name: '' })
          })
        }}
      >
        <div>
          <label className="label" htmlFor="code">
            รหัสประเภท
          </label>
          <input
            id="code"
            className="field"
            required
            placeholder="เช่น IT"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="cat-name">
            ชื่อประเภทของ
          </label>
          <input
            id="cat-name"
            className="field"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="flex items-end">
          <button className="btn-primary" disabled={busy}>
            เพิ่มประเภทของ
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">รหัส</th>
              <th className="px-4 py-2 font-medium">ชื่อ</th>
              <th className="px-4 py-2 font-medium">จำนวนสินค้า</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-slate-500">
                  ยังไม่มีประเภทของ
                </td>
              </tr>
            )}
            {categories.map((c) =>
              editingId === c.id ? (
                <tr key={c.id} className="bg-slate-50">
                  <td className="px-4 py-2">
                    <input
                      className="field"
                      value={edit.code}
                      onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className="field"
                      value={edit.name}
                      onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">{c.productCount}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      className="btn-primary mr-2"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(`/api/categories/${c.id}`, {
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
                <tr key={c.id}>
                  <td className="px-4 py-2 font-mono">{c.code}</td>
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">{c.productCount}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      className="btn-ghost mr-2"
                      onClick={() => {
                        setEditingId(c.id)
                        setEdit({ code: c.code, name: c.name })
                      }}
                    >
                      แก้ไข
                    </button>
                    <button
                      className="btn-danger"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`ลบประเภทของ "${c.name}" ?`)) return
                        void run(() => api(`/api/categories/${c.id}`, { method: 'DELETE' }))
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
