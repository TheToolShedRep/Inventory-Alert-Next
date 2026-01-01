// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/", // landing page
  "/alert(.*)", // QR alert pages
  "/sign-in(.*)", // Clerk sign-in
  "/sign-up(.*)", // Clerk sign-up
]);

const isProtectedRoute = createRouteMatcher([
  "/checklist(.*)",
  "/manager(.*)",
  "/manager.csv(.*)",
]);

export default clerkMiddleware((auth, req) => {
  // ✅ Public routes pass through
  if (isPublicRoute(req)) return;

  // ✅ Protect manager-only routes
  if (isProtectedRoute(req)) {
    const a = auth();

    // If auth() is async in your typings, we can still safely redirect
    // by returning a redirect response when user is missing.
    // @ts-expect-error - Clerk typings differ by version; runtime supports redirectToSignIn()
    if (!a.userId) return a.redirectToSignIn();
  }
});

// IMPORTANT: don't run middleware on static assets/_next
export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
