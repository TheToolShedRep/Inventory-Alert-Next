// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Public routes must NOT be gated, or you risk redirect loops / broken auth pages.
 * - "/" is your landing page
 * - "/alert" is your QR scan workflow (must work without login)
 * - "/sign-in" and "/sign-up" must always be public
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/alert(.*)",
  "/memo(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

/**
 * Only these routes require authentication.
 */
const isProtectedRoute = createRouteMatcher([
  "/scan(.*)",
  "/manager(.*)",
  "/checklist(.*)",
  "/manager.csv(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // ✅ Allow public routes through without any auth checks
  if (isPublicRoute(req)) return;

  // ✅ Only gate protected routes
  if (isProtectedRoute(req)) {
    const a = await auth(); // Clerk v6: auth() returns SessionAuthWithRedirect

    // Not signed in → send to Clerk sign-in and come back to the original URL
    if (!a.userId) {
      return a.redirectToSignIn({
        returnBackUrl: req.url,
      });
    }
  }
});

// IMPORTANT: don't run middleware on static assets/_next or files with extensions
export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
