import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Role is now tab-scoped via sessionStorage + request headers, so middleware
  // cannot reliably determine the active role for a specific browser tab.
  // Route access is enforced client-side and API auth is enforced server-side.
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/eos/:path*", "/sim/:path*", "/team-lead/:path*"],
};
