import { NextResponse, type NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function proxy(request: NextRequest) {
  if (SAFE_METHODS.has(request.method)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/payments/webhook/")) {
    return NextResponse.next();
  }

  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const configuredOrigin = process.env.APP_ORIGIN;
  if (!configuredOrigin) {
    return NextResponse.json(
      { error: "APP_ORIGIN is not configured." },
      { status: 503 },
    );
  }

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(configuredOrigin).origin;
  } catch {
    return NextResponse.json(
      { error: "APP_ORIGIN is invalid." },
      { status: 503 },
    );
  }

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (origin !== expectedOrigin || fetchSite === "cross-site") {
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
