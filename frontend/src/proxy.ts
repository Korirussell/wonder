import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;
  const protectedPaths = new Set(["/", "/library", "/history"]);

  if (!sessionCookie && protectedPaths.has(pathname)) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (sessionCookie && (pathname === "/sign-in" || pathname === "/sign-up")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/library", "/history", "/sign-in", "/sign-up"],
};
