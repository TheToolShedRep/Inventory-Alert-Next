// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/", // landing page
  "/alert(.*)", // QR alert pages
  "/sign-in(.*)", // Clerk pages must be public
  "/sign-up(.*)",
  "/sso-callback(.*)", // if you use /sso-callback in prod
]);

const isProtectedRoute = createRouteMatcher([
  "/checklist(.*)",
  "/manager(.*)",
  "/manager.csv(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // ✅ Always allow public routes
  if (isPublicRoute(req)) return;

  // ✅ Only guard protected routes
  if (!isProtectedRoute(req)) return;

  // ✅ In your setup, auth() returns a Promise → must await
  const a = await auth();

  // Not signed in? Send to sign-in and come back after login
  if (!a.userId) {
    return a.redirectToSignIn({ returnBackUrl: req.url });
  }

  // Signed in → allow
  return;
});

// IMPORTANT: don't run middleware on static assets/_next
export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
