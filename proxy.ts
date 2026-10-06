import { NextRequest, NextResponse } from "next/server";

const isProd = process.env.NODE_ENV === "production";
const SESSION_COOKIE = isProd ? "__Host-admin_session" : "admin_session";
const OPEN = ["/login", "/invite", "/robots.txt"];

// 1) Per-request CSP nonce. 2) A quick "no session cookie? go to /login" redirect.
// This is only a convenience: real checks happen in lib/dal.ts, next to the data.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!OPEN.some((p) => pathname === p || pathname.startsWith(p + "/")) && !request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    `style-src 'self' ${isProd ? `'nonce-${nonce}'` : "'unsafe-inline'"}`,
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${isProd ? "" : " ws: wss:"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
