'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type ScanLogFilterValues = {
  q: string
  type: string
  userId: string
  from: string
  to: string
}

const fieldClass =
  'w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10'

export function ScanLogFilters({
  users,
  values,
  serial,
}: {
  users: { id: string; displayName: string }[]
  values: ScanLogFilterValues
  /** serial ที่กำลังดูผลค้นหาอยู่ด้านบน - ต้องพากลับไปด้วยเพื่อไม่ให้ผลค้นหาหาย */
  serial: string
}) {
  const router = useRouter()
  const [form, setForm] = useState(values)

  function apply(next: ScanLogFilterValues) {
    const query = new URLSearchParams()
    if (serial) query.set('serial', serial)
    if (next.q.trim()) query.set('q', next.q.trim())
    if (next.type) query.set('type', next.type)
    if (next.userId) query.set('user', next.userId)
    if (next.from) query.set('from', next.from)
    if (next.to) query.set('to', next.to)
    // เปลี่ยนตัวกรองแล้วกลับไปหน้า 1 เสมอ
    router.push(`/serials?${query}#scan-logs`)
  }

  return (
    <form
      className="grid gap-3 border-b border-slate-100 bg-sky-50/40 p-4 sm:grid-cols-2 lg:grid-cols-5"
      data-testid="scan-log-filters"
      onSubmit={(e) => {
        e.preventDefault()
        apply(form)
      }}
    >
      <div>
        <label className="label" htmlFor="log-q">
          Serial
        </label>
        <input
          id="log-q"
          data-testid="log-q"
          className={`${fieldClass} font-mono`}
          placeholder="เช่น AP-00"
          autoComplete="off"
          value={form.q}
          onChange={(e) => setForm({ ...form, q: e.target.value })}
        />
      </div>

      <div>
        <label className="label" htmlFor="log-type">
          ประเภท
        </label>
        <select
          id="log-type"
          data-testid="log-type"
          className={fieldClass}
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          <option value="">ทุกประเภท</option>
          <option value="IN">รับเข้า</option>
          <option value="OUT">เบิกออก</option>
          <option value="AUDIT">ตรวจนับ</option>
        </select>
      </div>

      <div>
        <label className="label" htmlFor="log-user">
          ผู้สแกน
        </label>
        <select
          id="log-user"
          data-testid="log-user"
          className={fieldClass}
          value={form.userId}
          onChange={(e) => setForm({ ...form, userId: e.target.value })}
        >
          <option value="">ทุกคน</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="log-from">
          ตั้งแต่วันที่
        </label>
        <input
          id="log-from"
          data-testid="log-from"
          type="date"
          className={fieldClass}
          value={form.from}
          onChange={(e) => setForm({ ...form, from: e.target.value })}
        />
      </div>

      <div>
        <label className="label" htmlFor="log-to">
          ถึงวันที่
        </label>
        <input
          id="log-to"
          data-testid="log-to"
          type="date"
          className={fieldClass}
          value={form.to}
          onChange={(e) => setForm({ ...form, to: e.target.value })}
        />
      </div>

      <div className="flex items-end gap-2 lg:col-span-5">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
          data-testid="apply-log-filters"
        >
          ดูประวัติ
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-sky-50"
          data-testid="clear-log-filters"
          onClick={() => {
            const cleared = { q: '', type: '', userId: '', from: '', to: '' }
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
