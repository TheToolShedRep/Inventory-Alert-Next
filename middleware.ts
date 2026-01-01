// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/", // landing page
  "/alert(.*)", // QR alert pages
  "/sign-in(.*)", // auth pages must be public
  "/sign-up(.*)",
]);

const isProtectedRoute = createRouteMatcher([
  "/manager(.*)",
  "/checklist(.*)",
  "/manager.csv(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // ✅ Public routes pass through
  if (isPublicRoute(req)) return;

  // ✅ Only gate the protected routes
  if (isProtectedRoute(req)) {
    const a = await auth(); // your typings: auth() returns SessionAuthWithRedirect

    // If not signed in, redirect to Clerk sign-in
    if (!a.userId) {
      return a.redirectToSignIn();
    }
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
