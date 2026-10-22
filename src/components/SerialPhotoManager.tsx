'use client'

/* รูปthumbnail โหลดจาก API ภายในของเราเอง จึงใช้ <img> ธรรมดาแทน next/image */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react'
import { prepareImage } from '@/lib/image-compress'
import {
  DEFAULT_IMAGE_LABEL,
  IMAGE_ACCEPT,
  MAX_IMAGES_PER_UNIT,
  formatBytes,
} from '@/lib/image-rules'

export type SerialImageMeta = {
  id: string
  label: string
  fileName: string
  mimeType: string
  size: number
  createdAt: string
  uploadedByName: string
}

/**
 * จัดการรูปอุปกรณ์ของสินค้ารายชิ้น (ผูกกับ serial)
 *
 * mode="button" - ปุ่มเล็ก ๆ เปิดหน้าต่างรูป (ใช้ในตารางประวัติการขาย / หลังสแกนรับเข้า)
 * mode="inline" - แสดงเป็นการ์ดในหน้าเลย (ใช้ในหน้าค้นหา serial)
 */
export function SerialPhotoManager({
  serial,
  mode = 'button',
  buttonLabel = 'รูปอุปกรณ์',
}: {
  serial: string
  mode?: 'button' | 'inline'
  buttonLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [images, setImages] = useState<SerialImageMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(0)
  const [label, setLabel] = useState(DEFAULT_IMAGE_LABEL)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const baseUrl = `/api/serials/${encodeURIComponent(serial)}/images`
  const visible = mode === 'inline' || open
  const remaining = MAX_IMAGES_PER_UNIT - images.length
  const preview = images.find((image) => image.id === previewId) ?? null

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(baseUrl, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as {
        images?: SerialImageMeta[]
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? `โหลดรูปไม่สำเร็จ (${res.status})`)
      setImages(Array.isArray(data.images) ? data.images : [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'โหลดรูปไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  useEffect(() => {
    if (visible) void load()
  }, [visible, load])

  useEffect(() => {
    if (!open && !previewId) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (previewId) setPreviewId(null)
      else setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, previewId])

  async function onFilesPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    // เคลียร์ทันทีเพื่อให้เลือกไฟล์เดิมซ้ำได้ (เช่น อัปโหลดพลาดแล้วลองใหม่)
    event.target.value = ''
    if (picked.length === 0) return

    if (remaining <= 0) {
      setError(`แนบรูปได้สูงสุด ${MAX_IMAGES_PER_UNIT} รูปต่อเครื่อง - ลบรูปเก่าออกก่อน`)
      return
    }

    const batch = picked.slice(0, remaining)
    setError(
      picked.length > remaining
        ? `เลือกมา ${picked.length} รูป แต่แนบเพิ่มได้อีก ${remaining} รูป - จะอัปโหลด ${batch.length} รูปแรก`
        : ''
    )
    setUploading(batch.length)
    const uploaded: SerialImageMeta[] = []
    const failures: string[] = []

    for (const file of batch) {
      try {
        const prepared = await prepareImage(file)
        const form = new FormData()
        form.append('file', prepared.blob, prepared.name)
        form.append('label', label.trim() || DEFAULT_IMAGE_LABEL)

        const res = await fetch(baseUrl, { method: 'POST', body: form })
        const data = (await res.json().catch(() => ({}))) as {
          image?: SerialImageMeta
          error?: string
        }
        if (!res.ok) throw new Error(data.error ?? `อัปโหลดไม่สำเร็จ (${res.status})`)
        if (data.image) uploaded.push(data.image)
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ'}`)
      } finally {
        setUploading((count) => Math.max(0, count - 1))
      }
    }

    if (uploaded.length > 0) setImages((prev) => [...uploaded, ...prev])
    if (failures.length > 0) setError(failures.join('\n'))
  }

  async function removeImage(image: SerialImageMeta) {
    if (!window.confirm(`ลบ "${image.label}" (${image.fileName}) ออกถาวร?`)) return
    setError('')
    try {
      const res = await fetch(`${baseUrl}/${image.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `ลบรูปไม่สำเร็จ (${res.status})`)
      }
      setImages((prev) => prev.filter((item) => item.id !== image.id))
      setPreviewId((current) => (current === image.id ? null : current))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ลบรูปไม่สำเร็จ')
    }
  }

  const toolbar = (
    <div className="mt-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <label className="label text-xs" htmlFor={`photo-label-${serial}`}>
            คำอธิบายรูป
          </label>
          <input
            id={`photo-label-${serial}`}
            className="field"
            maxLength={60}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={DEFAULT_IMAGE_LABEL}
            disabled={uploading > 0}
          />
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          className="hidden"
          data-testid="photo-input"
          onChange={(e) => void onFilesPicked(e)}
        />
        <button
          type="button"
          className="btn-primary whitespace-nowrap px-3 py-2 text-sm"
          disabled={uploading > 0 || remaining <= 0}
          onClick={() => inputRef.current?.click()}
          data-testid="photo-upload"
        >
          {uploading > 0 ? `กำลังอัปโหลด ${uploading} รูป…` : 'แนบรูป'}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        JPG / PNG / WebP · สูงสุด {MAX_IMAGES_PER_UNIT} รูปต่อเครื่อง · แนบแล้ว{' '}
        <b>
          {images.length}/{MAX_IMAGES_PER_UNIT}
        </b>
      </p>
      {error && (
        <p
          className="mt-2 whitespace-pre-line rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300"
          data-testid="photo-error"
        >
          {error}
        </p>
      )}
    </div>
  )

  const gallery = (
    <div className="mt-3">
      {loading && images.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">กำลังโหลดรูป…</p>
      ) : loadError ? (
        <div className="text-sm text-rose-700 dark:text-rose-300">
          {loadError}{' '}
          <button type="button" className="underline" onClick={() => void load()}>
            ลองใหม่
          </button>
        </div>
      ) : images.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          ยังไม่มีรูป — แนบรูปตัวเครื่องไว้ใช้ตอนเครม
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((image) => {
            const src = `${baseUrl}/${image.id}`
            return (
              <li
                key={image.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                data-testid="photo-item"
              >
                <button
                  type="button"
                  className="block w-full"
                  onClick={() => setPreviewId(image.id)}
                  title="ดูรูปเต็ม"
                >
                  <img
                    src={src}
                    alt={image.label}
                    className="h-28 w-full object-cover"
                    loading="lazy"
                  />
                </button>
                <div className="p-2">
                  <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                    {image.label}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {formatBytes(image.size)} · {image.uploadedByName}
                  </p>
                  <div className="mt-1 flex items-center gap-3">
                    <a
                      className="text-xs text-sky-700 underline dark:text-sky-300"
                      href={`${src}?download=1`}
                      download={image.fileName}
                      data-testid="photo-download"
                    >
                      ดาวน์โหลด
                    </a>
                    <button
                      type="button"
                      className="text-xs text-rose-600 underline dark:text-rose-400"
                      onClick={() => void removeImage(image)}
                      data-testid="photo-delete"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  const previewOverlay = preview ? (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-slate-950/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`ดูรูป ${preview.label}`}
      data-testid="photo-preview"
      onClick={() => setPreviewId(null)}
    >
      <img
        src={`${baseUrl}/${preview.id}`}
        alt={preview.label}
        className="max-h-[78vh] max-w-full rounded-xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <div
        className="mt-3 flex flex-wrap items-center justify-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mr-1 max-w-[16rem] truncate text-sm text-white">{preview.fileName}</span>
        <a
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-800"
          href={`${baseUrl}/${preview.id}?download=1`}
          download={preview.fileName}
        >
          ดาวน์โหลด
        </a>
        <button
          type="button"
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white"
          onClick={() => void removeImage(preview)}
        >
          ลบรูป
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/40 px-4 py-2 text-sm font-medium text-white"
          onClick={() => setPreviewId(null)}
        >
          ปิด
        </button>
      </div>
    </div>
  ) : null

  if (mode === 'inline') {
    return (
      <section
        className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm dark:border-sky-900 dark:bg-slate-900"
        data-testid="serial-photos"
      >
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          รูปอุปกรณ์{' '}
          <span className="font-normal text-slate-400 dark:text-slate-500">
            ({images.length}/{MAX_IMAGES_PER_UNIT})
          </span>
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          ใช้ประกอบการเครม — ถ่ายให้เห็นตัวเครื่องและป้าย serial ชัด ๆ
        </p>
        {toolbar}
        {gallery}
        {previewOverlay}
      </section>
    )
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900"
        onClick={() => setOpen(true)}
        data-testid="photo-open"
        title={`รูปอุปกรณ์ ${serial}`}
      >
        <CameraIcon />
        {buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`รูปอุปกรณ์ ${serial}`}
          data-testid="photo-dialog"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="mt-6 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  รูปอุปกรณ์
                </h2>
                <p className="font-mono text-sm text-slate-500 dark:text-slate-400">{serial}</p>
              </div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => setOpen(false)}
                aria-label="ปิด"
              >
                ✕
              </button>
            </div>
            {toolbar}
            {gallery}
          </div>
        </div>
      )}

      {previewOverlay}
    </>
  )
}

function CameraIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}
