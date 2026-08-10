/**
 * แทนที่ `next/headers` ตอนรัน integration test (ผูกไว้ใน vitest.config.ts)
 *
 * โค้ดจริงเรียก cookies() ได้เฉพาะตอนอยู่ใน request ของ Next เท่านั้น
 * เทสเรียก route handler ตรงๆ จึงต้องมีโถคุกกี้ในหน่วยความจำมาแทน
 * ผลพลอยได้คือ flow login/logout ของจริงถูกทดสอบไปด้วย (JWT ถูกเซ็นและตรวจจริง)
 */

type CookieEntry = { name: string; value: string }

/** ประกาศชนิดแยกไว้ เพราะ set/delete คืน store ตัวเอง - ใช้ `typeof store` จะวนซ้ำ */
type CookieStore = {
  get(name: string): CookieEntry | undefined
  getAll(): CookieEntry[]
  has(name: string): boolean
  set(nameOrOptions: string | CookieEntry, value?: string): CookieStore
  delete(name: string): CookieStore
}

const jar = new Map<string, string>()

const store: CookieStore = {
  get(name) {
    const value = jar.get(name)
    return value === undefined ? undefined : { name, value }
  },
  getAll() {
    return [...jar].map(([name, value]) => ({ name, value }))
  },
  has(name) {
    return jar.has(name)
  },
  set(nameOrOptions, value) {
    if (typeof nameOrOptions === 'string') jar.set(nameOrOptions, value ?? '')
    else jar.set(nameOrOptions.name, nameOrOptions.value)
    return store
  },
  delete(name) {
    jar.delete(name)
    return store
  },
}

export async function cookies() {
  return store
}

export async function headers() {
  return new Headers()
}

export async function draftMode() {
  return { isEnabled: false, enable() {}, disable() {} }
}

/** เคลียร์ session ระหว่างเทส - ให้แต่ละเคสเริ่มจากสถานะ "ยังไม่ login" */
export function __clearCookies() {
  jar.clear()
}
