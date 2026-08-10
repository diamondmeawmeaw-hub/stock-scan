import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from './lib/session'

const PUBLIC_PATHS = ['/login']

/**
 * กันหน้าเว็บที่ยังไม่ login (API ตรวจซ้ำอีกชั้นในตัว route เอง)
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value)

  if (PUBLIC_PATHS.includes(pathname)) {
    if (session) return NextResponse.redirect(new URL('/', request.url))
    return NextResponse.next()
  }

  if (!session) {
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // ข้าม API, ไฟล์ static และ favicon - เหลือเฉพาะหน้าเว็บ
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
