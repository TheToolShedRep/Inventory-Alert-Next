// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * PUBLIC ROUTES
 * These must NOT be protected, or Clerk will bounce users away
 * from sign-in/sign-up and you’ll get redirect loops.
 */
const isPublicRoute = createRouteMatcher([
  "/", // optional landing page
  "/alert(.*)", // QR alert pages
  "/sign-in(.*)", // Clerk sign-in
  "/sign-up(.*)", // Clerk sign-up
]);

/**
 * PROTECTED ROUTES
 * Managers only
 */
const isProtectedRoute = createRouteMatcher([
  "/checklist(.*)",
  "/manager(.*)",
  "/manager.csv(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // ✅ Allow public routes through untouched
  if (isPublicRoute(req)) return;

  // ✅ Protect manager-only routes
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

/**
 * IMPORTANT: don't run middleware on static assets/_next
 */
export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
