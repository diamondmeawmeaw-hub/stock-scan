'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '@/lib/client'

type Role = 'ADMIN' | 'STAFF'

type User = {
  id: string
  username: string
  displayName: string
  role: Role
  active: boolean
  historyCount: number
}

const EMPTY_FORM = { username: '', displayName: '', password: '', role: 'STAFF' as Role }

const fieldClass =
  'w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10'

export function UsersClient({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ displayName: '', role: 'STAFF' as Role })
  const [pwTarget, setPwTarget] = useState<User | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const patch = (id: string, body: Record<string, unknown>) =>
    api(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) })

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-blue-50/60 to-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
            <UsersIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">ผู้ใช้งาน</h1>
            <p className="text-sm text-slate-500">
              ผู้ดูแลจัดการได้ทั้งหมด · พนักงานสแกนรับเข้า/เบิกออก/ตรวจนับได้ · {users.length} คน
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        data-testid="user-form"
        className="grid gap-3 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            await api('/api/users', { method: 'POST', body: JSON.stringify(form) })
            setForm(EMPTY_FORM)
          })
        }}
      >
        <div>
          <label className="label" htmlFor="username">
            ชื่อผู้ใช้
          </label>
          <input
            id="username"
            className={fieldClass}
            required
            placeholder="เช่น somchai"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="displayName">
            ชื่อที่แสดง
          </label>
          <input
            id="displayName"
            className={fieldClass}
            required
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            รหัสผ่าน
          </label>
          <input
            id="password"
            className={fieldClass}
            type="password"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="role">
            สิทธิ์
          </label>
          <select
            id="role"
            className={fieldClass}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            <option value="STAFF">พนักงาน</option>
            <option value="ADMIN">ผู้ดูแล</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
          >
            <PlusIcon className="h-4 w-4" />
            เพิ่มผู้ใช้
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">ชื่อผู้ใช้</th>
                <th className="px-4 py-2 font-medium">ชื่อที่แสดง</th>
                <th className="px-4 py-2 font-medium">สิทธิ์</th>
                <th className="px-4 py-2 font-medium">สถานะ</th>
                <th className="px-4 py-2 font-medium">ประวัติ</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isSelf = u.id === currentUserId
                return editingId === u.id ? (
                  <tr key={u.id} className="bg-sky-50/50">
                    <td className="px-4 py-2 font-mono text-slate-700">{u.username}</td>
                    <td className="px-4 py-2">
                      <input
                        className={fieldClass}
                        value={edit.displayName}
                        onChange={(e) => setEdit({ ...edit, displayName: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className={fieldClass}
                        disabled={isSelf}
                        value={edit.role}
                        onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}
                      >
                        <option value="STAFF">พนักงาน</option>
                        <option value="ADMIN">ผู้ดูแล</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">{u.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
                    <td className="px-4 py-2">{u.historyCount}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <button
                        className="mr-2 inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await patch(u.id, {
                              displayName: edit.displayName,
                              ...(isSelf ? {} : { role: edit.role }),
                            })
                            setEditingId(null)
                          })
                        }
                      >
                        บันทึก
                      </button>
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-sky-50"
                        onClick={() => setEditingId(null)}
                      >
                        ยกเลิก
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id} className={u.active ? '' : 'text-slate-400'}>
                    <td className="px-4 py-2 font-mono text-slate-800">
                      {u.username}
                      {isSelf && (
                        <span className="ml-2 rounded-full bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700">
                          คุณ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{u.displayName}</td>
                    <td className="px-4 py-2">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-4 py-2">
                      {u.active ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          ใช้งาน
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          ปิดใช้งาน
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{u.historyCount}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <button
                        className="mr-2 inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-sky-50"
                        onClick={() => {
                          setEditingId(u.id)
                          setEdit({ displayName: u.displayName, role: u.role })
                        }}
                      >
                        แก้ไข
                      </button>
                      <button
                        className="mr-2 inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-sky-50"
                        data-testid="reset-password"
                        disabled={busy}
                        onClick={() => setPwTarget(u)}
                      >
                        ตั้งรหัสใหม่
                      </button>
                      {!isSelf && (
                        <>
                          <button
                            className="mr-2 inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={busy}
                            onClick={() => void run(() => patch(u.id, { active: !u.active }))}
                          >
                            {u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                          </button>
                          <button
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm(`ลบผู้ใช้ "${u.displayName}" ?`)) return
                              void run(() => api(`/api/users/${u.id}`, { method: 'DELETE' }))
                            }}
                          >
                            ลบ
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {pwTarget && (
        <PasswordDialog
          user={pwTarget}
          isSelf={pwTarget.id === currentUserId}
          onCancel={() => setPwTarget(null)}
          onSubmit={async (currentPassword, password) => {
            await patch(pwTarget.id, {
              password,
              ...(pwTarget.id === currentUserId ? { currentPassword } : {}),
            })
            setPwTarget(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        role === 'ADMIN' ? 'bg-indigo-100 text-indigo-700' : 'bg-sky-100 text-sky-700'
      }`}
    >
      {role === 'ADMIN' ? 'ผู้ดูแล' : 'พนักงาน'}
    </span>
  )
}

/**
 * กล่องตั้งรหัสผ่านใหม่
 *
 * เปลี่ยนรหัสของตัวเองต้องกรอกรหัสเดิมด้วย ฝั่ง API ก็บังคับซ้ำอีกชั้น
 * (ที่นี่แค่กันไม่ให้ยิงไปทั้งที่รู้อยู่แล้วว่าไม่ผ่าน)
 */
function PasswordDialog({
  user,
  isSelf,
  onCancel,
  onSubmit,
}: {
  user: User
  isSelf: boolean
  onCancel: () => void
  onSubmit: (currentPassword: string, password: string) => Promise<void>
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next !== confirm) {
      setError('รหัสใหม่กับช่องยืนยันไม่ตรงกัน')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(current, next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ตั้งรหัสใหม่ไม่สำเร็จ')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <form
        data-testid="password-dialog"
        className="w-full max-w-sm space-y-3 rounded-2xl border border-sky-100 bg-white p-5 shadow-xl"
        onSubmit={submit}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
            <KeyIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">ตั้งรหัสผ่านใหม่</h2>
            <p className="text-sm text-slate-500">
              {isSelf ? 'บัญชีของคุณเอง' : `ให้ "${user.displayName}"`}
            </p>
          </div>
        </div>

        {error && (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            data-testid="password-error"
          >
            {error}
          </p>
        )}

        {isSelf && (
          <div>
            <label className="label" htmlFor="currentPassword">
              รหัสผ่านเดิม
            </label>
            <input
              id="currentPassword"
              data-testid="current-password"
              className={fieldClass}
              type="password"
              required
              autoFocus
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="newPassword">
            รหัสผ่านใหม่
          </label>
          <input
            id="newPassword"
            data-testid="new-password"
            className={fieldClass}
            type="password"
            required
            minLength={6}
            autoFocus={!isSelf}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="confirmPassword">
            ยืนยันรหัสผ่านใหม่
          </label>
          <input
            id="confirmPassword"
            data-testid="confirm-password"
            className={fieldClass}
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onCancel}
            disabled={busy}
          >
            ยกเลิก
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="password-submit"
            disabled={busy}
          >
            บันทึก
          </button>
        </div>
      </form>
    </div>
  )
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-5 w-5'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-5 w-5'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-5 w-5'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  )
}