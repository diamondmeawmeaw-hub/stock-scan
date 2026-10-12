'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '@/lib/client'

type Category = { id: string; name: string }
type Product = { id: string; sku: string; name: string; categoryId: string; categoryName: string }

type Mode = 'all' | 'custom'

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
  // ของที่หยิบใส่ขอบเขตแล้ว - เอาออกได้ทีละชิ้น
  const [pickedCats, setPickedCats] = useState<string[]>([])
  const [pickedProds, setPickedProds] = useState<string[]>([])
  // dropdown ใช้เลือกของเข้าขอบเขต
  const [browseCat, setBrowseCat] = useState('')
  const [browseProd, setBrowseProd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickedCatSet = new Set(pickedCats)
  const pickedProdSet = new Set(pickedProds)
  // รุ่นที่โชว์ให้หยิบ = รุ่นในประเภทที่กำลังดู (ยังไม่หยิบ)
  const browseList = products.filter((p) => p.categoryId === browseCat && !pickedProdSet.has(p.id))
  const pickedProdItems = products.filter((p) => pickedProdSet.has(p.id))

  const pickedCount = pickedCats.length + pickedProds.length
  const canStart = mode === 'all' || pickedCount > 0

  function addCategory() {
    if (browseCat && !pickedCatSet.has(browseCat)) setPickedCats([...pickedCats, browseCat])
  }

  function addProduct() {
    if (browseProd && !pickedProdSet.has(browseProd)) {
      setPickedProds([...pickedProds, browseProd])
      setBrowseProd('')
    }
  }

  async function start(e: React.FormEvent) {
    e.preventDefault()
    if (!canStart || busy) return
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { name: name.trim() || defaultName() }
      if (mode === 'custom') {
        body.categoryIds = pickedCats
        body.productIds = pickedProds
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

      {mode === 'custom' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="scope-pick-category">
                หยิบทั้งประเภท
              </label>
              <div className="flex gap-2">
                <select
                  id="scope-pick-category"
                  data-testid="scope-pick-category"
                  className="field flex-1"
                  value={browseCat}
                  onChange={(e) => {
                    setBrowseCat(e.target.value)
                    setBrowseProd('')
                  }}
                >
                  <option value="">— เลือกประเภท —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} disabled={pickedCatSet.has(c.id)}>
                      {c.name}
                      {pickedCatSet.has(c.id) ? ' (หยิบแล้ว)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="scope-add-category"
                  className="btn-ghost shrink-0"
                  disabled={!browseCat || pickedCatSet.has(browseCat)}
                  onClick={addCategory}
                >
                  + เพิ่ม
                </button>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="scope-pick-product">
                หยิบเป็นรุ่น{browseCat ? ` (ใน${categories.find((c) => c.id === browseCat)?.name ?? ''})` : ''}
              </label>
              <div className="flex gap-2">
                <select
                  id="scope-pick-product"
                  data-testid="scope-pick-product"
                  className="field flex-1"
                  value={browseProd}
                  disabled={!browseCat}
                  onChange={(e) => setBrowseProd(e.target.value)}
                >
                  <option value="">{browseCat ? '— เลือกรุ่น —' : 'เลือกประเภทก่อน'}</option>
                  {browseList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="scope-add-product"
                  className="btn-ghost shrink-0"
                  disabled={!browseProd}
                  onClick={addProduct}
                >
                  + เพิ่ม
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="label">ที่หยิบไว้ ({pickedCount} รายการ)</div>
            {pickedCount === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                ยังไม่ได้หยิบอะไรเลย - เลือกจาก dropdown ข้างบน
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2" data-testid="scope-picked">
                {pickedCats.map((id) => (
                  <li
                    key={`c-${id}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 py-1 pr-1.5 pl-3 text-sm font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                  >
                    {categories.find((c) => c.id === id)?.name ?? '?'}
                    <button
                      type="button"
                      data-testid={`scope-remove-cat-${id}`}
                      aria-label="เอาประเภทนี้ออก"
                      onClick={() => setPickedCats(pickedCats.filter((x) => x !== id))}
                      className="rounded-full px-1.5 hover:bg-sky-200 dark:hover:bg-sky-800"
                    >
                      ×
                    </button>
                  </li>
                ))}
                {pickedProdItems.map((p) => (
                  <li
                    key={`p-${p.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 py-1 pr-1.5 pl-3 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  >
                    {p.name}
                    <button
                      type="button"
                      data-testid={`scope-remove-prod-${p.id}`}
                      aria-label="เอารุ่นนี้ออก"
                      onClick={() => setPickedProds(pickedProds.filter((x) => x !== p.id))}
                      className="rounded-full px-1.5 hover:bg-emerald-200 dark:hover:bg-emerald-800"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!canStart && (
        <p className="text-sm text-amber-700 dark:text-amber-300">หยิบอย่างน้อย 1 ประเภทหรือ 1 รุ่นก่อนเริ่ม</p>
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
