import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const role = request.cookies.get("ops-role")?.value;

  // Protect /admin route — only supervisors allowed
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!role || role !== "supervisor") {
      return NextResponse.redirect(new URL("/team-lead", request.url));
    }
    return NextResponse.next();
  }

  // /team-lead is accessible to all authenticated roles (supervisors and team leads)
  // Client-side redirects in AdminLayout handle further access control

  // If no cookie at all, let the page handle it (PinGate will show)
  if (!role) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/team-lead/:path*"],
};
