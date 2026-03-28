import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const hostname = req.headers.get("host") || "localhost:3000";

  const response = NextResponse.next();

  // CORS
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,DELETE");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Access-Control-Allow-Credentials", "true");

  // Propagate tenant hostname for SSR + API routes
  response.headers.set("x-tenant-hostname", hostname);

  return response;
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
