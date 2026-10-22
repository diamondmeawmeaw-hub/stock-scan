'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'

type Props = {
  /** ลิงก์ export แบบเดิม - ใช้เป็น fallback เมื่อ JavaScript ไม่ทำงาน */
  href: string
  /** ข้อมูลที่ส่งให้ POST /api/exports */
  payload: Record<string, unknown>
  label: string
  testId: string
  format: 'xlsx' | 'pdf'
  className?: string
}

type Status = 'idle' | 'working' | 'error'

export function ExportButton({ href, payload, label, testId, format, className }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
    }
  }, [])

  async function start(event: MouseEvent<HTMLAnchorElement>) {
    // เปิดแท็บใหม่/กด modifier ตามปกติ - ใช้ลิงก์ export เดิม
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return
    }
    event.preventDefault()
    if (status === 'working') return

    const controller = new AbortController()
    controllerRef.current = controller
    setStatus('working')
    setMessage('')
    setProgress(0)

    try {
      const created = await fetch('/api/exports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      const body = await created.json().catch(() => ({}))
      if (!created.ok) {
        throw new Error(body.error || 'สร้างไฟล์ไม่สำเร็จ')
      }
      await poll(String(body.id), controller.signal)
    } catch (err) {
      if (controller.signal.aborted || !mountedRef.current) return
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'สร้างไฟล์ไม่สำเร็จ')
    }
  }

  async function poll(id: string, signal: AbortSignal) {
    for (let attempt = 0; attempt < 600; attempt++) {
      const response = await fetch(`/api/exports/${id}`, { signal, cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error || 'ตรวจสอบสถานะไฟล์ไม่สำเร็จ')
      }

      if (!mountedRef.current) return
      setProgress(typeof body.progress === 'number' ? body.progress : 0)

      if (body.status === 'DONE') {
        const anchor = document.createElement('a')
        anchor.href = body.downloadUrl || `/api/exports/${id}/download`
        if (body.fileName) anchor.download = body.fileName
        anchor.rel = 'noopener'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        setStatus('idle')
        setProgress(0)
        return
      }
      if (body.status === 'FAILED') {
        throw new Error(body.error || 'สร้างไฟล์ไม่สำเร็จ')
      }

      await new Promise((resolve) => setTimeout(resolve, 800))
      if (signal.aborted) return
    }
    throw new Error('ใช้เวลาสร้างไฟล์นานเกินไป กรุณาลองใหม่')
  }

  const working = status === 'working'

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <a
        href={href}
        onClick={start}
        data-testid={testId}
        aria-busy={working}
        aria-disabled={working}
        className={[
          className ??
            'inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-sky-50 dark:border-sky-900 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
          working ? 'cursor-wait opacity-70' : '',
        ].join(' ')}
      >
        {working ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
        ) : format === 'xlsx' ? (
          <DownloadIcon className="h-4 w-4 text-emerald-600" />
        ) : (
          <FileTextIcon className="h-4 w-4 text-red-600" />
        )}
        {working ? `กำลังสร้างไฟล์${progress > 5 ? ` ${progress}%` : '...'}` : label}
      </a>
      {status === 'error' && (
        <span
          role="alert"
          data-testid={`${testId}-error`}
          className="max-w-56 text-right text-xs text-red-600 dark:text-red-400"
        >
          {message}
        </span>
      )}
    </span>
  )
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-4 w-4'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  )
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-4 w-4'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  )
}
