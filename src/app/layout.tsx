import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stock Scan - ระบบเช็คสต็อกด้วยการสแกน',
  description: 'สแกน serial รับเข้า เบิกออก และตรวจนับสต็อก',
}

/**
 * viewport-fit=cover = เนื้อหาลากใต้รอยบาก/Dynamic Island ได้ (ค่อย pad ด้วย env(safe-area-inset-*))
 * interactive-widget=resizes-content = คีย์บอร์ด Android ย่อ viewport ให้ 100dvh ขยับตามเหมือน iOS
 * theme-color สองค่าไว้ให้ตรงกับหัวเว็บทั้งโหมดสว่าง/มืด (JS จะ sync ค่าจริงอีกทีตอนสลับธีม)
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
}

/**
 * อ่านธีมก่อน paint กันหน้ากะพริบ - ต้องตรงกับ src/lib/theme.ts
 * (เก็บใน localStorage คีย์ stock-theme ค่า light|dark|system, system ดูตามเครื่อง)
 */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('stock-theme')||'system';var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');var c=d?'#020617':'#ffffff';var p=function(){var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute('content',c)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',p);else p()}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  )
}
