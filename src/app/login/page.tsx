'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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
          <input
            id="password"
            name="password"
            type="password"
            className="field"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
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
