import { NextRequest, NextResponse } from "next/server";

// Add cors
export async function middleware(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET,HEAD,POST,PUT,DELETE"
  );
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}

// Apply middleware to all API routes
export const config = {
  matcher: "/api/:path*",
};
