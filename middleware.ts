// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/checklist(.*)",
  "/manager(.*)",
  "/manager.csv(.*)",
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  // Protect manager + checklist routes only
  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  // IMPORTANT:
  // Do NOT rewrite or modify the request.
  // Returning nothing lets Next.js continue
  // and preserves query params like ?item=&location=
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
