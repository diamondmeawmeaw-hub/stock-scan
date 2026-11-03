'use client'

export const THEME_KEY = 'stock-theme'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** ค่าที่จำไว้ (ยังไม่เคยเลือก = 'system') */
export function getStoredTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* อ่านไม่ได้ใช้ค่าตั้งต้น */
  }
  return 'system'
}

export function setStoredTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_KEY, choice)
  } catch {
    /* จำไม่ได้ก็ใช้ต่อได้ แค่ไม่จำข้ามรอบ */
  }
}

function systemDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

/** ธีมที่ใช้จริง - system แปลงตามเครื่อง */
export function resolveTheme(choice?: ThemeChoice): ResolvedTheme {
  const stored = choice ?? getStoredTheme()
  if (stored === 'light') return 'light'
  if (stored === 'dark') return 'dark'
  return systemDark() ? 'dark' : 'light'
}

/** สีแถบสถานะ/เบราว์เซอร์ - ต้องตรงกับพื้นหลังหัวเว็บ (NavBar) ทั้งสองโหมด */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#ffffff',
  dark: '#020617',
}

/** ธีมสลับด้วย class ไม่ใช่ตาม OS - ต้องอัปเดต theme-color เอง ไม่งั้นแถบสถานะสีไม่ตรง */
function syncThemeColor(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll('meta[name="theme-color"]').forEach((tag) => {
    tag.setAttribute('content', THEME_COLOR[resolved])
  })
}

/** สลับ class บน <html> ให้ตรงค่าที่จำไว้ */
export function applyTheme(choice?: ThemeChoice): ResolvedTheme {
  const resolved = resolveTheme(choice)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  syncThemeColor(resolved)
  return resolved
}
