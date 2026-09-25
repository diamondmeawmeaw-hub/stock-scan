'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '@/lib/client'

type ProjectOption = { id: string; customerId: string; name: string; active: boolean }

/**
 * เปลี่ยนโปรเจคของรายการขาย 1 แถว - ย้ายของข้ามโปรเจคโดยไม่ต้องแก้ทีละหน้า
 * ตัวเลือกเป็นโปรเจคของลูกค้าคนเดียวกับที่ซื้อของเท่านั้น (ฝั่งเซิร์ฟเวอร์ก็กันซ้ำอีกชั้น)
 */
export function ProjectAssign({
  logId,
  customerId,
  value,
  projects,
}: {
  logId: string
  customerId: string | null
  value: string | null
  projects: ProjectOption[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!customerId) return <span className="text-slate-400">-</span>

  const options = projects.filter((p) => p.customerId === customerId)

  async function move(projectId: string | null) {
    setBusy(true)
    setError('')
    try {
      await api(`/api/scan-logs/${logId}`, {
        method: 'PATCH',
        body: JSON.stringify({ projectId }),
      })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'แก้ไขไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <select
        className="w-full rounded-md border border-sky-200 bg-white px-2 py-1 text-sm outline-none transition focus:border-sky-500"
        data-testid="row-project-select"
        aria-label="โปรเจคของรายการนี้"
        disabled={busy}
        value={value ?? ''}
        onChange={(e) => void move(e.target.value || null)}
      >
        <option value="">- ไม่ระบุโปรเจค -</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.active ? '' : ' (ปิดแล้ว)'}
          </option>
        ))}
        {/* ค้างอยู่บนรายการนี้แต่ไม่ใช่ของลูกค้าคนนี้ (ข้อมูลเก่า) กัน dropdown โดด */}
        {value && !options.some((p) => p.id === value) && (
          <option value={value}>(ไม่ใช่ของลูกค้านี้)</option>
        )}
      </select>
      {error && <span className="whitespace-nowrap text-xs text-red-600">{error}</span>}
    </span>
  )
}
