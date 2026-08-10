'use client'

import { OUT_REASON_LABELS, type OutReasonCode } from './scan-rules'

/** ตัวช่วยเรียก API ฝั่ง client - โยน Error พร้อมข้อความภาษาไทยจากเซิร์ฟเวอร์ */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error(data.error ?? `เรียก ${url} ไม่สำเร็จ (${res.status})`)
  return data as T
}

export const OUT_REASONS = (
  Object.entries(OUT_REASON_LABELS) as [OutReasonCode, string][]
).map(([value, label]) => ({ value, label }))
