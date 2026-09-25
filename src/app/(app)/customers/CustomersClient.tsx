'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/client'

type Customer = { id: string; code: string; name: string; note: string | null; active: boolean; saleCount: number }

type Project = {
  id: string
  customerId: string
  name: string
  note: string | null
  active: boolean
  /** จำนวนรายการขายที่ผูกกับโปรเจคนี้ */
  saleCount: number
}

export function CustomersClient({ customers, projects }: { customers: Customer[]; projects: Project[] }) {
  const router = useRouter()
  const [form, setForm] = useState({ code: '', name: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // แถวโปรเจคที่กำลังขยายดู / กำลังเปลี่ยนชื่อ
  const [expandedId, setExpandedId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editName, setEditName] = useState('')

  async function save(data: unknown, reset = false) {
    setBusy(true); setError('')
    try { await api('/api/customers', { method: 'POST', body: JSON.stringify(data) }); if (reset) setForm({ code: '', name: '', note: '' }); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  async function patchProject(id: string, data: Record<string, unknown>) {
    setBusy(true); setError('')
    try { await api(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'แก้ไขไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <div className="space-y-5">
    <div><h1 className="text-xl font-semibold">ลูกค้า</h1><p className="text-sm text-slate-500">จัดการรายชื่อลูกค้า ดูโปรเจคที่เคยซื้อขาย และประวัติการขาย</p></div>
    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    <form className="card grid gap-3 p-4 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void save({ ...form, note: form.note || null }, true) }}>
      <input className="field" required placeholder="รหัสลูกค้า" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
      <input className="field" required placeholder="ชื่อลูกค้า" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input className="field" placeholder="หมายเหตุ / เบอร์ติดต่อ" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      <button className="btn-primary" disabled={busy}>เพิ่มลูกค้า</button>
    </form>
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            <th className="px-4 py-2">รหัส</th>
            <th className="px-4 py-2">ชื่อ</th>
            <th className="px-4 py-2">หมายเหตุ</th>
            <th className="px-4 py-2 text-right">ขายแล้ว</th>
            <th className="px-4 py-2 text-right">โปรเจค</th>
            <th className="px-4 py-2">สถานะ</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {customers.map((c) => {
            const list = projects.filter((p) => p.customerId === c.id)
            const expanded = expandedId === c.id
            return (
              <Fragment key={c.id}>
                <tr className={!c.active ? 'text-slate-400' : ''}>
                  <td className="px-4 py-2 font-mono">{c.code}</td>
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">{c.note ?? '-'}</td>
                  <td className="px-4 py-2 text-right">{c.saleCount}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      className="rounded-md px-2 py-1 text-sky-700 transition hover:bg-sky-50"
                      data-testid="toggle-projects"
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? '' : c.id)}
                    >
                      {list.length} โปรเจค {expanded ? '▴' : '▾'}
                    </button>
                  </td>
                  <td className="px-4 py-2">{c.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
                  <td className="px-4 py-2 text-right"><button className="btn-ghost" disabled={busy} onClick={() => void (async () => { await api(`/api/customers/${c.id}`, { method: 'PATCH', body: JSON.stringify({ active: !c.active }) }); router.refresh() })()}>{c.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button></td>
                </tr>
                {expanded && (
                  <tr data-testid="project-list">
                    <td colSpan={7} className="bg-slate-50/60 px-4 py-3">
                      <p className="mb-2 text-xs font-medium uppercase text-slate-500">
                        โปรเจคของ {c.name} · สร้างใหม่ได้ตอนเบิกขาย (หน้าเบิกออก)
                      </p>
                      {list.length === 0 ? (
                        <p className="text-sm text-slate-500">ยังไม่มีโปรเจค</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {list.map((p) => {
                            const editing = editingId === p.id
                            return (
                              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2" data-testid="project-row">
                                {editing ? (
                                  <>
                                    <input
                                      className="field flex-1"
                                      value={editName}
                                      onChange={(e) => setEditName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && editName.trim()) {
                                          void patchProject(p.id, { name: editName.trim() }).then(() => setEditingId(''))
                                        }
                                        if (e.key === 'Escape') setEditingId('')
                                      }}
                                    />
                                    <button
                                      className="btn-primary"
                                      disabled={busy || !editName.trim()}
                                      data-testid="project-save-name"
                                      onClick={() => void patchProject(p.id, { name: editName.trim() }).then(() => setEditingId(''))}
                                    >
                                      บันทึก
                                    </button>
                                    <button className="btn-ghost" onClick={() => setEditingId('')}>ยกเลิก</button>
                                  </>
                                ) : (
                                  <>
                                    <span className={`font-medium ${p.active ? '' : 'text-slate-400 line-through'}`} data-testid="project-name">
                                      {p.name}
                                    </span>
                                    {!p.active && <span className="text-xs text-slate-400">(ปิดแล้ว)</span>}
                                    <span className="text-xs text-slate-500">ขายแล้ว {p.saleCount} รายการ</span>
                                    <span className="ml-auto flex gap-1">
                                      <button
                                        className="btn-ghost"
                                        data-testid="project-rename"
                                        onClick={() => { setEditingId(p.id); setEditName(p.name) }}
                                      >
                                        เปลี่ยนชื่อ
                                      </button>
                                      <button
                                        className="btn-ghost"
                                        data-testid="project-toggle"
                                        disabled={busy}
                                        onClick={() => void patchProject(p.id, { active: !p.active })}
                                      >
                                        {p.active ? 'ปิดโปรเจค' : 'เปิดโปรเจค'}
                                      </button>
                                    </span>
                                  </>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  </div>
}
