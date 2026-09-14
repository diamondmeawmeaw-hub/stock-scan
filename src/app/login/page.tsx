'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

/** จำแค่ชื่อผู้ใช้ในเครื่องนี้ - ไม่เก็บรหัส ปลอดภัยเท่าเดิม */
const REMEMBER_KEY = 'stock-scan-username'

function rememberedUsername(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(REMEMBER_KEY) ?? ''
  } catch {
    return ''
  }
}

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [username, setUsername] = useState(rememberedUsername)
  const [password, setPassword] = useState('')
  // จำแค่ชื่อผู้ใช้ในเครื่องนี้ (ไม่เก็บรหัส) - เปิดไว้เป็นค่าเริ่มต้น
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'เข้าสู่ระบบไม่สำเร็จ')
        return
      }
      try {
        if (remember && username.trim()) {
          window.localStorage.setItem(REMEMBER_KEY, username.trim())
        } else {
          window.localStorage.removeItem(REMEMBER_KEY)
        }
      } catch {
        /* จำไม่ได้ก็ช่าง เข้าระบบได้ก็พอ */
      }
      router.replace(params.get('next') || '/')
      router.refresh()
    } catch {
      setError('ติดต่อเซิร์ฟเวอร์ไม่ได้')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="card w-full max-w-sm p-6" data-testid="login-form">
      <h1 className="text-xl font-semibold">เข้าสู่ระบบ</h1>
      <p className="mt-1 text-sm text-slate-500">ระบบเช็คสต็อกด้วยการสแกน serial</p>

      <div className="mt-5 space-y-4">
        <div>
          <label className="label" htmlFor="username">
            ชื่อผู้ใช้
          </label>
          <input
            id="username"
            name="username"
            className="field"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            รหัสผ่าน
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              className="field pr-12"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              aria-pressed={showPassword}
              data-testid="toggle-password"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            data-testid="remember-username"
          />
          จำชื่อผู้ใช้ในเครื่องนี้
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary mt-5 w-full" disabled={busy}>
        {busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}

function EyeIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M10.733 5.076a10.75 10.75 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </svg>
  )
}
