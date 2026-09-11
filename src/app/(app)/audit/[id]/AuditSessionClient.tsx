'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ScanConsole, type ScanOutcomeLike } from '@/components/ScanConsole'
import { api } from '@/lib/client'
import type { AuditReport } from '@/lib/scan-service'

export function AuditSessionClient({
  sessionId,
  initialReport,
}: {
  sessionId: string
  initialReport: AuditReport
}) {
  const [report, setReport] = useState(initialReport)
  // ค่าเริ่มต้นไม่ปรับสต็อก - กันกดปิดรอบเพลินๆ แล้วของหายโดนตัดออกจากคลังโดยไม่ตั้งใจ
  // ใครจะปรับจริงให้ติ๊กเอง
  const [applyAdjustments, setApplyAdjustments] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const closed = report.status === 'CLOSED'

  const refresh = useCallback(async () => {
    const { report: fresh } = await api<{ report: AuditReport }>(`/api/audit/sessions/${sessionId}`)
    setReport(fresh)
  }, [sessionId])

  // ยิงรัวๆ ไม่ต้องรีเฟรชทุกครั้ง รอให้เงียบสักครู่ค่อยดึงผลใหม่
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => void refresh(), 800)
  }, [refresh])

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [])

  const onScan = useCallback(
    async (serial: string): Promise<ScanOutcomeLike> => {
      const outcome = await api<ScanOutcomeLike>(`/api/audit/sessions/${sessionId}/scan`, {
        method: 'POST',
        body: JSON.stringify({ serial }),
      })
      scheduleRefresh()
      return outcome
    },
    [sessionId, scheduleRefresh]
  )

  async function closeSession() {
    const ok = window.confirm(
      applyAdjustments
        ? 'ปิดรอบและปรับสต็อกตามผลนับจริง (ของหายจะถูกตัดออก ของเกินจะรับเข้า) ยืนยันหรือไม่?'
        : 'ปิดรอบโดยไม่ปรับสต็อก (เก็บผลไว้ดูอย่างเดียว) ยืนยันหรือไม่?'
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const { report: finalReport } = await api<{ report: AuditReport }>(
        `/api/audit/sessions/${sessionId}/close`,
        { method: 'POST', body: JSON.stringify({ applyAdjustments }) }
      )
      setReport(finalReport)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ปิดรอบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold">{report.name}</h1>
          <p className="text-sm text-slate-500">
            ขอบเขต: {report.categoryName ?? 'ทั้งคลัง'} ·{' '}
            {closed ? `ปิดรอบแล้ว ${formatTime(report.closedAt)}` : 'กำลังนับ'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost" onClick={() => void refresh()} disabled={busy}>
            รีเฟรชผล
          </button>
          {!closed && (
            <>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={applyAdjustments}
                  onChange={(e) => setApplyAdjustments(e.target.checked)}
                />
                ปรับสต็อกตามผลนับ
              </label>
              <button
                className="btn-primary"
                onClick={closeSession}
                disabled={busy}
                data-testid="close-audit"
              >
                ปิดรอบ &amp; สรุปผล
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="ระบบว่ามี" value={report.expectedCount} />
        <Tile label="ยิงเจอ" value={report.scannedCount} testId="audit-scanned" />
        <Tile label="ของหาย" value={report.missing.length} tone="red" testId="audit-missing" />
        <Tile label="ของเกิน" value={report.surplus.length} tone="amber" testId="audit-surplus" />
      </div>

      {!closed && (
        <ScanConsole onScan={onScan} label="ยิง serial ของจริงในคลัง" />
      )}

      {(report.quantityLines.length > 0 || !closed) && (
        <QuantityAuditSection
          lines={report.quantityLines}
          closed={closed}
          sessionId={sessionId}
          onCounted={scheduleRefresh}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <UnitTable
          title="ของหาย (ระบบว่ามี แต่ยิงไม่เจอ)"
          rows={report.missing}
          empty="ไม่มีของหาย"
          testId="missing-table"
        />
        <UnitTable
          title="ของเกิน (ยิงเจอ แต่ระบบว่าเบิกออกไปแล้ว)"
          rows={report.surplus}
          empty="ไม่มีของเกิน"
          testId="surplus-table"
        />
      </div>

      {report.unknownSerials.length > 0 && (
        <div className="card overflow-hidden">
          <h2 className="border-b border-slate-200 px-4 py-3 font-medium">
            serial ที่ระบบไม่รู้จัก ({report.unknownSerials.length}) - ต้องเพิ่มเข้าระบบก่อน
          </h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {report.unknownSerials.map((u) => (
              <li key={u.serial} className="flex justify-between px-4 py-2">
                <span className="font-mono">{u.serial}</span>
                <span className="text-slate-500">{formatTime(u.scannedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function QuantityAuditSection({
  lines,
  closed,
  sessionId,
  onCounted,
}: {
  lines: AuditReport['quantityLines']
  closed: boolean
  sessionId: string
  onCounted: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (lines.length === 0) return null

  async function submit(productId: string) {
    const raw = values[productId] ?? ''
    if (raw.trim() === '' || busyId) return
    setBusyId(productId)
    setError(null)
    try {
      await api(`/api/audit/sessions/${sessionId}/quantity`, {
        method: 'POST',
        body: JSON.stringify({ productId, counted: Number(raw) }),
      })
      // บันทึกแล้วล้างช่อง กันกรอกซ้ำโดยไม่ตั้งใจ (ยอดที่บันทึกดูได้ในคอลัมน์ "นับได้")
      setValues((v) => ({ ...v, [productId]: '' }))
      onCounted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกยอดนับไม่สำเร็จ')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="card overflow-hidden" data-testid="quantity-audit">
      <h2 className="border-b border-slate-200 px-4 py-3 font-medium">
        สินค้านับจำนวน ({lines.length}) — กรอกยอดที่นับได้จริง
      </h2>
      {error && <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">สินค้า</th>
              <th className="px-4 py-2 text-right font-medium">ระบบว่ามี</th>
              <th className="px-4 py-2 text-right font-medium">นับได้</th>
              <th className="px-4 py-2 text-right font-medium">ผลต่าง</th>
              {!closed && <th className="px-4 py-2 font-medium">กรอกยอดนับ</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => {
              const diff = l.counted === null ? null : l.counted - l.expected
              return (
                <tr key={l.productId}>
                  <td className="px-4 py-2">
                    {l.productName} <span className="text-slate-400">({l.sku})</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{l.expected}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">
                    {l.counted ?? '-'}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-medium tabular-nums ${diff === null ? 'text-slate-400' : diff === 0 ? 'text-emerald-600' : 'text-red-600'}`}
                  >
                    {diff === null ? '-' : diff > 0 ? `+${diff}` : `${diff}`}
                  </td>
                  {!closed && (
                    <td className="px-4 py-2">
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void submit(l.productId)
                        }}
                      >
                        <input
                          className="field w-24"
                          inputMode="numeric"
                          type="number"
                          min={0}
                          step={1}
                          placeholder={l.unitLabel ?? 'จำนวน'}
                          value={values[l.productId] ?? ''}
                          onChange={(e) =>
                            setValues((v) => ({ ...v, [l.productId]: e.target.value }))
                          }
                        />
                        <button
                          className="btn-primary shrink-0"
                          disabled={busyId === l.productId}
                          data-testid={`count-${l.sku}`}
                        >
                          บันทึก
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  tone = 'slate',
  testId,
}: {
  label: string
  value: number
  tone?: 'slate' | 'red' | 'amber'
  testId?: string
}) {
  const color =
    tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-slate-900'
  return (
    <div className="card p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${color}`} data-testid={testId}>
        {value}
      </div>
    </div>
  )
}

function UnitTable({
  title,
  rows,
  empty,
  testId,
}: {
  title: string
  rows: { unitId: string; serial: string; sku: string; productName: string }[]
  empty: string
  testId: string
}) {
  return (
    <div className="card overflow-hidden" data-testid={testId}>
      <h2 className="border-b border-slate-200 px-4 py-3 font-medium">
        {title} ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Serial</th>
              <th className="px-4 py-2 font-medium">สินค้า</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.unitId}>
                <td className="px-4 py-2 font-mono">{r.serial}</td>
                <td className="px-4 py-2 text-slate-600">
                  {r.productName} <span className="text-slate-400">({r.sku})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function formatTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('th-TH') : '-'
}
