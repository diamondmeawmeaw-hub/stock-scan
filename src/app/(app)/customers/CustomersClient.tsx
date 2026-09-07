'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '@/lib/client'

type Customer = { id: string; code: string; name: string; note: string | null; active: boolean; saleCount: number }

export function CustomersClient({ customers }: { customers: Customer[] }) {
  const router = useRouter()
  const [form, setForm] = useState({ code: '', name: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(data: unknown, reset = false) {
    setBusy(true); setError('')
    try { await api('/api/customers', { method: 'POST', body: JSON.stringify(data) }); if (reset) setForm({ code: '', name: '', note: '' }); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ') }
    finally { setBusy(false) }
  }
  return <div className="space-y-5">
    <div><h1 className="text-xl font-semibold">ลูกค้า</h1><p className="text-sm text-slate-500">จัดการรายชื่อลูกค้าและดูประวัติการขาย</p></div>
    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    <form className="card grid gap-3 p-4 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void save({ ...form, note: form.note || null }, true) }}>
      <input className="field" required placeholder="รหัสลูกค้า" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
      <input className="field" required placeholder="ชื่อลูกค้า" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input className="field" placeholder="หมายเหตุ / เบอร์ติดต่อ" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      <button className="btn-primary" disabled={busy}>เพิ่มลูกค้า</button>
    </form>
    <div className="card overflow-hidden"><table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="px-4 py-2">รหัส</th><th className="px-4 py-2">ชื่อ</th><th className="px-4 py-2">หมายเหตุ</th><th className="px-4 py-2 text-right">ขายแล้ว</th><th className="px-4 py-2">สถานะ</th><th /></tr></thead><tbody className="divide-y divide-slate-100">{customers.map((c) => <tr key={c.id} className={!c.active ? 'text-slate-400' : ''}><td className="px-4 py-2 font-mono">{c.code}</td><td className="px-4 py-2">{c.name}</td><td className="px-4 py-2">{c.note ?? '-'}</td><td className="px-4 py-2 text-right">{c.saleCount}</td><td className="px-4 py-2">{c.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</td><td className="px-4 py-2 text-right"><button className="btn-ghost" disabled={busy} onClick={() => void (async () => { await api(`/api/customers/${c.id}`, { method: 'PATCH', body: JSON.stringify({ active: !c.active }) }); router.refresh() })()}>{c.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button></td></tr>)}</tbody></table></div>
  </div>
}
