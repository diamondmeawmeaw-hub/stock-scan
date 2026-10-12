'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '@/lib/client'

type Category = { id: string; name: string }
type Product = { id: string; sku: string; name: string; categoryId: string; categoryName: string }

type Mode = 'all' | 'categories' | 'custom'

export function NewAuditForm({
  categories,
  products,
}: {
  categories: Category[]
  products: Product[]
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<Mode>('all')
  // โหมดเลือกประเภท: ติ๊กได้หลายอัน (categoryId เดี่ยวแบบเดิมเลิกใช้)
  const [pickedCategories, setPickedCategories] = useState<string[]>([])
  // โหมดกำหนดเอง: ติ๊กประเภท + รุ่นผสมกัน (ขอบเขต = union)
  const [customCategories, setCustomCategories] = useState<string[]>([])
  const [customProducts, setCustomProducts] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(list: string[], id: string, set: (next: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  const customCount = customCategories.length + customProducts.length
  const canStart =
    mode === 'all' || (mode === 'categories' && pickedCategories.length > 0) || customCount > 0

  async function start(e: React.FormEvent) {
    e.preventDefault()
    if (!canStart || busy) return
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { name: name.trim() || defaultName() }
      if (mode === 'categories') {
        body.categoryIds = pickedCategories
      } else if (mode === 'custom') {
        body.categoryIds = customCategories
        body.productIds = customProducts
      }
      const { session } = await api<{ session: { id: string } }>('/api/audit/sessions', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      router.push(`/audit/${session.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปิดรอบไม่สำเร็จ')
      setBusy(false)
    }
  }

  const byCategory = new Map<string, Product[]>()
  for (const p of products) {
    const list = byCategory.get(p.categoryId) ?? []
    list.push(p)
    byCategory.set(p.categoryId, list)
  }

  return (
    <form onSubmit={start} className="card space-y-4 p-4" data-testid="new-audit-form">
      <h2 className="font-medium">เปิดรอบตรวจนับใหม่</h2>
      <div>
        <label className="label" htmlFor="audit-name">
          ชื่อรอบ
        </label>
        <input
          id="audit-name"
          data-testid="audit-name"
          className="field"
          placeholder={defaultName()}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <span className="label">ขอบเขตที่นับ</span>
        <div className="flex gap-2" role="tablist" aria-label="วิธีเลือกขอบเขต">
          {(
            [
              ['all', 'ทั้งคลัง'],
              ['categories', 'เลือกประเภท'],
              ['custom', 'กำหนดเอง'],
            ] as [Mode, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              data-testid={`audit-mode-${value}`}
              onClick={() => setMode(value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                mode === value
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'categories' && (
        <fieldset>
          <legend className="label">ติ๊กประเภทที่จะนับ ({pickedCategories.length} ประเภท)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((c) => (
              <label
                key={c.id}
                data-testid="scope-category"
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={pickedCategories.includes(c.id)}
                  onChange={() => toggle(pickedCategories, c.id, setPickedCategories)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {mode === 'custom' && (
        <fieldset className="space-y-4">
          <legend className="label">
            ติ๊กประเภทและรุ่นที่จะนับรวมกัน ({customCount} รายการ)
          </legend>
          <div>
            <div className="mb-1 text-sm font-medium">ประเภท</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {categories.map((c) => (
                <label
                  key={c.id}
                  data-testid="scope-category"
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={customCategories.includes(c.id)}
                    onChange={() => toggle(customCategories, c.id, setCustomCategories)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-sm font-medium">รุ่น</div>
            {categories.map((c) => {
              const list = byCategory.get(c.id) ?? []
              if (list.length === 0) return null
              return (
                <div key={c.id}>
                  <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{c.name}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {list.map((p) => (
                      <label
                        key={p.id}
                        data-testid="scope-product"
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        <input
                          type="checkbox"
                          checked={customProducts.includes(p.id)}
                          onChange={() => toggle(customProducts, p.id, setCustomProducts)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block font-mono text-xs text-slate-500 dark:text-slate-400">
                            {p.sku}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </fieldset>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!canStart && (
        <p className="text-sm text-amber-700 dark:text-amber-300">ติ๊กอย่างน้อย 1 ประเภทหรือ 1 รุ่นก่อนเริ่ม</p>
      )}
      <button className="btn-primary" disabled={busy || !canStart} data-testid="start-audit">
        {busy ? 'กำลังเปิดรอบ...' : 'เริ่มตรวจนับ'}
      </button>
    </form>
  )
}

function defaultName() {
  return `ตรวจนับ ${new Date().toLocaleDateString('th-TH')}`
}
