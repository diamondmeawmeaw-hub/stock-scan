import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getStoredTheme, resolveTheme, setStoredTheme, THEME_KEY } from '@/lib/theme'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    clear: () => store.clear(),
  })
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function systemDark() {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
}

describe('theme', () => {
  it('ใช้คีย์ stock-theme', () => {
    expect(THEME_KEY).toBe('stock-theme')
  })

  it('ไม่มีค่าจำไว้ ใช้ตาม system (มืด)', () => {
    systemDark()
    expect(resolveTheme()).toBe('dark')
  })

  it('ไม่มีค่าจำไว้ ใช้ตาม system (สว่าง)', () => {
    expect(resolveTheme()).toBe('light')
  })

  it('จำ dark ไว้ได้ dark แม้ system สว่าง', () => {
    setStoredTheme('dark')
    expect(getStoredTheme()).toBe('dark')
    expect(resolveTheme()).toBe('dark')
  })

  it('จำ light ไว้ได้ light แม้ system มืด', () => {
    systemDark()
    setStoredTheme('light')
    expect(resolveTheme()).toBe('light')
  })
})
