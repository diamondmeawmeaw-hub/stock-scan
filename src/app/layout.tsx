import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stock Scan - ระบบเช็คสต็อกด้วยการสแกน',
  description: 'สแกน serial รับเข้า เบิกออก และตรวจนับสต็อก',
}

/**
 * อ่านธีมก่อน paint กันหน้ากะพริบ - ต้องตรงกับ src/lib/theme.ts
 * (เก็บใน localStorage คีย์ stock-theme ค่า light|dark|system, system ดูตามเครื่อง)
 */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('stock-theme')||'system';var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`

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
