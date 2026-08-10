import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stock Scan - ระบบเช็คสต็อกด้วยการสแกน',
  description: 'สแกน serial รับเข้า เบิกออก และตรวจนับสต็อก',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="font-sans">{children}</body>
    </html>
  )
}
