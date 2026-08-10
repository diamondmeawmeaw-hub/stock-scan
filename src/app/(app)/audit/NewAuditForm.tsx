'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '@/lib/client'

export function NewAuditForm({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { session } = await api<{ session: { id: string } }>('/api/audit/sessions', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() || defaultName(), categoryId: categoryId || null }),
      })
      router.push(`/audit/${session.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปิดรอบไม่สำเร็จ')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={start} className="card space-y-4 p-4" data-testid="new-audit-form">
      <h2 className="font-medium">เปิดรอบตรวจนับใหม่</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="audit-name">
            ชื่อรอบ
          </label>
          <input
            id="audit-name"
            data-testid="audit-name"
            className="field"
            placeholder={defaultName()}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="audit-scope">
            ขอบเขตที่นับ
          </label>
          <select
            id="audit-scope"
            data-testid="audit-scope"
            className="field"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">ทั้งคลัง</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary" disabled={busy} data-testid="start-audit">
        {busy ? 'กำลังเปิดรอบ...' : 'เริ่มตรวจนับ'}
      </button>
    </form>
  )
}

function defaultName() {
  return `ตรวจนับ ${new Date().toLocaleDateString('th-TH')}`
}
