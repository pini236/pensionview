import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // 1. Run intl middleware first (handles locale routing)
  const response = intlMiddleware(request);

  // 2. Refresh Supabase session — sets/refreshes auth cookies on every request.
  //    This is the recommended Supabase pattern for Next.js App Router and fixes
  //    "first login attempt fails" issues caused by stale or missing session cookies.
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );
    // This call refreshes the auth token if expired and persists new cookies.
    await supabase.auth.getUser();
  } catch {
    // Don't block the request on auth refresh failures
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
