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
      <div>
        <h1 className="text-xl font-semibold">ผู้ใช้งาน</h1>
        <p className="text-sm text-slate-500">
          ผู้ดูแลจัดการได้ทั้งหมด · พนักงานสแกนรับเข้า/เบิกออก/ตรวจนับได้ · {users.length} คน
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form
        data-testid="user-form"
        className="card grid gap-3 p-4 sm:grid-cols-5"
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
            className="field"
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
            className="field"
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
            className="field"
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
            className="field"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            <option value="STAFF">พนักงาน</option>
            <option value="ADMIN">ผู้ดูแล</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-primary" disabled={busy}>
            เพิ่มผู้ใช้
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
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
                <tr key={u.id} className="bg-slate-50">
                  <td className="px-4 py-2 font-mono">{u.username}</td>
                  <td className="px-4 py-2">
                    <input
                      className="field"
                      value={edit.displayName}
                      onChange={(e) => setEdit({ ...edit, displayName: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="field"
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
                      className="btn-primary mr-2"
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
                    <button className="btn-ghost" onClick={() => setEditingId(null)}>
                      ยกเลิก
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={u.id} className={u.active ? '' : 'text-slate-400'}>
                  <td className="px-4 py-2 font-mono">
                    {u.username}
                    {isSelf && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                        คุณ
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{u.displayName}</td>
                  <td className="px-4 py-2">{u.role === 'ADMIN' ? 'ผู้ดูแล' : 'พนักงาน'}</td>
                  <td className="px-4 py-2">
                    {u.active ? (
                      <span className="text-emerald-700">ใช้งาน</span>
                    ) : (
                      <span className="text-slate-500">ปิดใช้งาน</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{u.historyCount}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      className="btn-ghost mr-2"
                      onClick={() => {
                        setEditingId(u.id)
                        setEdit({ displayName: u.displayName, role: u.role })
                      }}
                    >
                      แก้ไข
                    </button>
                    <button
                      className="btn-ghost mr-2"
                      data-testid="reset-password"
                      disabled={busy}
                      onClick={() => setPwTarget(u)}
                    >
                      ตั้งรหัสใหม่
                    </button>
                    {!isSelf && (
                      <>
                        <button
                          className="btn-ghost mr-2"
                          disabled={busy}
                          onClick={() => void run(() => patch(u.id, { active: !u.active }))}
                        >
                          {u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        </button>
                        <button
                          className="btn-danger"
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
        className="w-full max-w-sm space-y-3 rounded-xl bg-white p-5 shadow-xl"
        onSubmit={submit}
      >
        <div>
          <h2 className="text-base font-semibold">ตั้งรหัสผ่านใหม่</h2>
          <p className="text-sm text-slate-500">
            {isSelf ? 'บัญชีของคุณเอง' : `ให้ "${user.displayName}"`}
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="password-error">
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
              className="field"
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
            className="field"
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
            className="field"
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
            ยกเลิก
          </button>
          <button className="btn-primary" data-testid="password-submit" disabled={busy}>
            บันทึก
          </button>
        </div>
      </form>
    </div>
  )
}
