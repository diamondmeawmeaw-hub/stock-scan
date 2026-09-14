'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/client'

/**
 * ปุ่มคืนของที่เบิกผิดเข้าคลัง - ใช้ในตารางประวัติ (serials/sales)
 * ยิงเบิกผิดแล้วกดตรงนี้ได้เลย ไม่ต้องจำทริคไปยิงคืนที่หน้า scan-in
 */
export function ReturnButton({ scanLogId }: { scanLogId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onReturn() {
    if (busy) return
    const ok = window.confirm('คืนของรายการนี้กลับเข้าคลัง?')
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await api('/api/scan/return', {
        method: 'POST',
        body: JSON.stringify({ scanLogId }),
      })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'คืนของไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void onReturn()}
        disabled={busy}
        data-testid={`return-${scanLogId}`}
        className="rounded-md px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
      >
        {busy ? 'กำลังคืน...' : 'คืนของ'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
