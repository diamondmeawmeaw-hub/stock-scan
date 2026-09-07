'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type ScanOutcomeLike = {
  accepted: boolean
  result: string
  message: string
  serial: string
  product?: { id: string; sku: string; name: string; categoryName: string } | null
  productInStock?: number
  unitId?: string | null
  scanLogId?: string | null
}

export type FeedItem = ScanOutcomeLike & { key: number; at: Date }

/** เสียงตอบรับสั้นๆ ให้รู้ผลโดยไม่ต้องละสายตาจากของ */
function beep(ok: boolean) {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = ok ? 1180 : 320
    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.12 : 0.32))
    osc.start()
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.32))
    osc.onended = () => void ctx.close()
  } catch {
    /* เบราว์เซอร์ไม่ให้เล่นเสียงก็ข้ามไป ไม่ใช่เรื่องคอขาดบาดตาย */
  }
}

/**
 * ช่องรับการสแกน - หัวใจของทุกหน้าสแกน
 *
 * เครื่องสแกน HID จะ "พิมพ์" ตัวอักษรเร็วมากแล้วปิดท้ายด้วย Enter
 * ทุกครั้งที่กด Enter จะเคลียร์ช่องทันทีแล้วโยนเข้าคิว เพื่อให้ยิงติดๆ กันได้
 * โดยไม่ต้องรอผลลัพธ์ของตัวก่อนหน้า (ไม่มีการสแกนตกหล่น)
 */
export function ScanConsole({
  onScan,
  onDelete,
  onConfirm,
  disabled = false,
  disabledHint,
  label = 'ยิงบาร์โค้ด / serial',
  soundEnabled = true,
  hideFeed = false,
}: {
  onScan: (serial: string) => Promise<ScanOutcomeLike>
  onDelete?: (item: FeedItem) => Promise<void> | void
  onConfirm?: (items: FeedItem[]) => Promise<ScanOutcomeLike[] | void>
  disabled?: boolean
  disabledHint?: string
  label?: string
  soundEnabled?: boolean
  hideFeed?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const queueRef = useRef<string[]>([])
  const drainingRef = useRef(false)
  const keyRef = useRef(0)

  const [value, setValue] = useState('')
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [pending, setPending] = useState(0)
  const [stats, setStats] = useState({ accepted: 0, rejected: 0 })
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const removeFromFeed = useCallback(
    (key: number) => {
      setFeed((prev) => prev.filter((item) => item.key !== key))
    },
    []
  )

  const handleDelete = useCallback(
    async (item: FeedItem) => {
      if (onDelete) {
        await onDelete(item)
      }
      removeFromFeed(item.key)
      setStats((current) => item.accepted
        ? { ...current, accepted: Math.max(0, current.accepted - 1) }
        : { ...current, rejected: Math.max(0, current.rejected - 1) })
    },
    [onDelete, removeFromFeed]
  )

  async function confirmFeed() {
    if (!onConfirm || feed.length === 0 || confirming) return
    setConfirming(true)
    setConfirmError(null)
    try {
      const outcomes = await onConfirm(feed)
      if (outcomes) {
        setStats({
          accepted: outcomes.filter((outcome) => outcome.accepted).length,
          rejected: outcomes.filter((outcome) => !outcome.accepted).length,
        })
        setFeed((prev) => prev
          .map((item) => {
            const outcome = outcomes.find((candidate) => candidate.serial === item.serial)
            return outcome ? { ...item, ...outcome } : item
          })
          .filter((item) => item.result === 'ERROR' || item.accepted === false))
      }
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : 'ยืนยันบันทึกไม่สำเร็จ')
    }
    finally {
      setConfirming(false)
    }
  }

  const drain = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    try {
      while (queueRef.current.length > 0) {
        const serial = queueRef.current.shift()!
        setPending(queueRef.current.length + 1)
        let outcome: ScanOutcomeLike
        try {
          outcome = await onScan(serial)
        } catch (err) {
          outcome = {
            accepted: false,
            result: 'ERROR',
            message: err instanceof Error ? err.message : 'ส่งข้อมูลไม่สำเร็จ',
            serial,
          }
        }
        keyRef.current += 1
        setFeed((prev) => [{ ...outcome, key: keyRef.current, at: new Date() }, ...prev].slice(0, 200))
        setStats((s) =>
          outcome.accepted ? { ...s, accepted: s.accepted + 1 } : { ...s, rejected: s.rejected + 1 }
        )
        if (soundEnabled) beep(outcome.accepted)
      }
    } finally {
      drainingRef.current = false
      setPending(0)
    }
  }, [onScan, soundEnabled])

  function submitCurrent() {
    const serial = value.trim()
    setValue('')
    if (!serial) return
    queueRef.current.push(serial)
    setPending(queueRef.current.length + (drainingRef.current ? 1 : 0))
    void drain()
  }

  // เครื่องสแกนยิงเข้าช่องนี้เสมอ ดังนั้นต้องคาโฟกัสไว้ตลอด
  useEffect(() => {
    if (!disabled) inputRef.current?.focus()
  }, [disabled])

  const last = feed[0]

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <label className="label" htmlFor="scan-input">
          {label}
        </label>
        <input
          id="scan-input"
          ref={inputRef}
          data-testid="scan-input"
          className="w-full rounded-lg border-2 border-slate-300 px-4 py-3 font-mono text-2xl tracking-wider outline-none focus:border-slate-900 disabled:bg-slate-100"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          value={value}
          placeholder={disabled ? (disabledHint ?? 'ยังยิงไม่ได้') : 'รอสแกน...'}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitCurrent()
            }
          }}
          onBlur={(e) => {
            // กันโฟกัสหลุดตอนคลิกที่ว่างๆ (ยิงแล้วหาย) แต่ไม่แย่งโฟกัสจากปุ่ม/ช่องอื่นที่ตั้งใจคลิก
            if (!disabled && !e.relatedTarget) setTimeout(() => inputRef.current?.focus(), 0)
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span data-testid="scan-stats">
            รับ <b className="text-emerald-600">{stats.accepted}</b> · ปฏิเสธ{' '}
            <b className="text-red-600">{stats.rejected}</b>
          </span>
          {pending > 0 && <span data-testid="scan-pending">กำลังส่ง {pending} รายการ...</span>}
          <span className="ml-auto">ยิงแล้วกด Enter (เครื่องสแกนทำให้เอง)</span>
        </div>
      </div>

      {last && (
        <div
          data-testid="scan-last"
          data-accepted={last.accepted ? 'true' : 'false'}
          className={`rounded-xl border-2 p-4 ${
            last.accepted ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'
          }`}
        >
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-mono text-2xl font-semibold">{last.serial}</span>
            <span
              className={`text-lg font-medium ${last.accepted ? 'text-emerald-700' : 'text-red-700'}`}
            >
              {last.accepted ? '✓' : '✕'} {last.message}
            </span>
          </div>
          {last.product && (
            <div className="mt-1 text-sm text-slate-600">
              {last.product.name} ({last.product.sku}) · {last.product.categoryName}
              {typeof last.productInStock === 'number' && (
                <> · คงเหลือ {last.productInStock} ชิ้น</>
              )}
            </div>
          )}
        </div>
      )}

      {feed.length > 0 && (
        <div className="card overflow-hidden">
          {onConfirm && (
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-amber-50 px-4 py-3">
              <div>
                <span className="text-sm text-amber-800">ตรวจสอบรายการให้เรียบร้อย ก่อนยืนยันบันทึกเข้าสต็อก</span>
                {confirmError && <p className="mt-1 text-sm text-red-700">{confirmError}</p>}
              </div>
              <button
                type="button"
                className="btn-primary whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                disabled={confirming || feed.length === 0}
                onClick={() => void confirmFeed()}
                data-testid="confirm-scan"
              >
                {confirming ? 'กำลังบันทึก...' : `ยืนยันบันทึก ${feed.length} รายการ`}
              </button>
            </div>
          )}
          <table className="w-full text-sm" data-testid="scan-feed">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">เวลา</th>
                <th className="px-4 py-2 font-medium">Serial</th>
                <th className="px-4 py-2 font-medium">สินค้า</th>
                <th className="px-4 py-2 font-medium">ผล</th>
                <th className="px-4 py-2 font-medium w-12 text-center">ลบ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {feed.map((item) => (
                <tr key={item.key} className={item.accepted ? '' : 'bg-red-50/50'}>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                    {item.at.toLocaleTimeString('th-TH')}
                  </td>
                  <td className="px-4 py-2 font-mono">{item.serial}</td>
                  <td className="px-4 py-2 text-slate-600">{item.product?.name ?? '-'}</td>
                  <td
                    className={`px-4 py-2 ${item.accepted ? 'text-emerald-700' : 'text-red-700'}`}
                  >
                    {item.message}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {onDelete && item.accepted && (
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                        title="ลบรายการนี้"
                        data-testid={`delete-${item.key}`}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
