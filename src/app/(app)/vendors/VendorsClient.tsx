'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '@/lib/client'

type Vendor = {
  id: string
  code: string
  name: string
  note: string | null
  active: boolean
  unitCount: number
}

const EMPTY = { code: '', name: '', note: '' }

export function VendorsClient({ vendors }: { vendors: Vendor[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState(EMPTY)

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
        <h1 className="text-xl font-semibold">ผู้ขาย</h1>
        <p className="text-sm text-slate-500">
          ตัวแทนจำหน่ายที่รับของเข้ามา เช่น SiS · เลือกตอนรับเข้าเพื่อให้ย้อนดูได้ว่าของมาจากเจ้าไหน
          · {vendors.length} ราย
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="vendor-error">
          {error}
        </p>
      )}

      <form
        data-testid="vendor-form"
        className="card grid gap-3 p-4 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            await api('/api/vendors', {
              method: 'POST',
              body: JSON.stringify({ ...form, note: form.note || null }),
            })
            setForm(EMPTY)
          })
        }}
      >
        <div>
          <label className="label" htmlFor="vendor-code">
            รหัสผู้ขาย
          </label>
          <input
            id="vendor-code"
            data-testid="vendor-code"
            className="field"
            required
            placeholder="เช่น SIS"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="vendor-name">
            ชื่อผู้ขาย
          </label>
          <input
            id="vendor-name"
            data-testid="vendor-name"
            className="field"
            required
            placeholder="เช่น SiS Distribution"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="vendor-note">
            หมายเหตุ
          </label>
          <input
            id="vendor-note"
            className="field"
            placeholder="เช่น เบอร์ติดต่อ"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <div className="flex items-end">
          <button className="btn-primary" disabled={busy} data-testid="vendor-submit">
            เพิ่มผู้ขาย
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">รหัส</th>
              <th className="px-4 py-2 font-medium">ชื่อ</th>
              <th className="px-4 py-2 font-medium">หมายเหตุ</th>
              <th className="px-4 py-2 text-right font-medium">ของที่รับเข้า</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vendors.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-slate-500">
                  ยังไม่มีผู้ขาย
                </td>
              </tr>
            )}
            {vendors.map((v) =>
              editingId === v.id ? (
                <tr key={v.id} className="bg-slate-50">
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
                  <td className="px-4 py-2">
                    <input
                      className="field"
                      value={edit.note}
                      onChange={(e) => setEdit({ ...edit, note: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">{v.unitCount}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      className="btn-primary mr-2"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(`/api/vendors/${v.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ ...edit, note: edit.note || null }),
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
                <tr key={v.id} data-testid="vendor-row" className={v.active ? '' : 'text-slate-400'}>
                  <td className="px-4 py-2 font-mono">{v.code}</td>
                  <td className="px-4 py-2">
                    {v.name}
                    {!v.active && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                        ปิดใช้งาน
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{v.note ?? '-'}</td>
                  <td className="px-4 py-2 text-right">{v.unitCount}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      className="btn-ghost mr-2"
                      onClick={() => {
                        setEditingId(v.id)
                        setEdit({ code: v.code, name: v.name, note: v.note ?? '' })
                      }}
                    >
                      แก้ไข
                    </button>
                    <button
                      className="btn-ghost mr-2"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          api(`/api/vendors/${v.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ active: !v.active }),
                          })
                        )
                      }
                    >
                      {v.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    </button>
                    <button
                      className="btn-danger"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`ลบผู้ขาย "${v.name}" ?`)) return
                        void run(() => api(`/api/vendors/${v.id}`, { method: 'DELETE' }))
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
