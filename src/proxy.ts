import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// กันเฉพาะหน้าเว็บ — /api/* ยังเปิดเหมือนเดิม (มีระบบอื่นเรียกตรง)
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (pathname === "/login") return NextResponse.next()

  // NextAuth ตั้งชื่อ cookie ต่างกันระหว่าง http (dev) กับ https (prod)
  const sessionToken =
    request.cookies.get("next-auth.session-token")?.value ??
    request.cookies.get("__Secure-next-auth.session-token")?.value

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("callbackUrl", pathname + search)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf|eot|json|geojson)$).*)",
  ],
}
