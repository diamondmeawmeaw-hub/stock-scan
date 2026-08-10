'use client'

import { useCallback, useState } from 'react'
import { ScanConsole, type ScanOutcomeLike } from '@/components/ScanConsole'
import { OUT_REASONS, api } from '@/lib/client'

export function ScanOutClient() {
  const [reason, setReason] = useState<string>('SALE')
  const [note, setNote] = useState('')

  const onScan = useCallback(
    async (serial: string): Promise<ScanOutcomeLike> =>
      api<ScanOutcomeLike>('/api/scan/out', {
        method: 'POST',
        body: JSON.stringify({ serial, reason, note: note || null }),
      }),
    [reason, note]
  )

  return (
    <div className="space-y-4">
      <div className="card grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="reason">
            เหตุผลที่เบิกออก
          </label>
          <select
            id="reason"
            data-testid="reason-select"
            className="field"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {OUT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="note">
            หมายเหตุ (ติดไปกับทุกรายการที่ยิงในรอบนี้)
          </label>
          <input
            id="note"
            className="field"
            placeholder="เช่น ใช้งานในโครงการ ABC Site"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      <ScanConsole onScan={onScan} label="ยิง serial ที่จะเบิกออก" />
    </div>
  )
}
