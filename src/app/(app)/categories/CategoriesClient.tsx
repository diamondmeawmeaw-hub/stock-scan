'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '@/lib/client'

type Category = {
  id: string
  code: string
  name: string
  productCount: number
  photosEnabled: boolean
}

type EditState = { code: string; name: string; photosEnabled: boolean }

export function CategoriesClient({
  categories,
  canEditPhotos,
}: {
  categories: Category[]
  /** เฉพาะผู้ดูแลระบบเท่านั้นที่เลือกได้ว่าประเภทไหนเก็บรูปอุปกรณ์ */
  canEditPhotos: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', photosEnabled: false })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditState>({ code: '', name: '', photosEnabled: false })

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
        <p className="text-sm text-slate-500 dark:text-slate-400">
          ใช้จัดกลุ่มสินค้า และใช้เป็นขอบเขตตอนตรวจนับ · {categories.length} ประเภท
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {canEditPhotos
            ? 'เปิด “เก็บรูปอุปกรณ์” เฉพาะประเภทที่ต้องแนบรูปตอนเครม (เช่น NVR)'
            : 'การเปิด/ปิด “เก็บรูปอุปกรณ์” ทำได้เฉพาะผู้ดูแลระบบ'}
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <form
        data-testid="category-form"
        className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            // ส่ง photosEnabled เฉพาะ admin - staff แก้ master data ได้แต่ไม่ใช่สิทธิ์นี้
            const payload = canEditPhotos
              ? form
              : { code: form.code, name: form.name }
            await api('/api/categories', { method: 'POST', body: JSON.stringify(payload) })
            setForm({ code: '', name: '', photosEnabled: false })
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
        {canEditPhotos ? (
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                data-testid="category-photos-new"
                checked={form.photosEnabled}
                onChange={(e) => setForm({ ...form, photosEnabled: e.target.checked })}
              />
              เก็บรูปอุปกรณ์
            </label>
          </div>
        ) : null}
        <div className="flex items-end">
          <button className="btn-primary" disabled={busy}>
            เพิ่มประเภทของ
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2 font-medium">รหัส</th>
              <th className="px-4 py-2 font-medium">ชื่อ</th>
              <th className="px-4 py-2 font-medium">จำนวนสินค้า</th>
              <th className="px-4 py-2 font-medium">เก็บรูป</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-slate-500 dark:text-slate-400">
                  ยังไม่มีประเภทของ
                </td>
              </tr>
            )}
            {categories.map((c) =>
              editingId === c.id ? (
                <tr key={c.id} data-testid="category-row-edit" className="bg-slate-50 dark:bg-slate-800/60">
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
                  <td className="px-4 py-2">
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        data-testid={`category-photos-${c.code}`}
                        checked={edit.photosEnabled}
                        disabled={!canEditPhotos}
                        title={canEditPhotos ? undefined : 'ผู้ดูแลระบบเท่านั้น'}
                        onChange={(e) => setEdit({ ...edit, photosEnabled: e.target.checked })}
                      />
                      เก็บรูป
                    </label>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      className="btn-primary mr-2"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const payload = canEditPhotos
                            ? edit
                            : { code: edit.code, name: edit.name }
                          await api(`/api/categories/${c.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify(payload),
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
                <tr key={c.id} data-testid="category-row">
                  <td className="px-4 py-2 font-mono">{c.code}</td>
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">{c.productCount}</td>
                  <td className="px-4 py-2">
                    <span
                      data-testid={`category-photos-${c.code}`}
                      className={
                        c.photosEnabled
                          ? 'whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'whitespace-nowrap text-xs text-slate-400 dark:text-slate-500'
                      }
                    >
                      {c.photosEnabled ? 'เก็บรูป' : 'ไม่เก็บ'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      className="btn-ghost mr-2"
                      onClick={() => {
                        setEditingId(c.id)
                        setEdit({
                          code: c.code,
                          name: c.name,
                          photosEnabled: c.photosEnabled,
                        })
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
