// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/checklist(.*)",
  "/manager(.*)",
  "/manager.csv(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

// IMPORTANT: don't run middleware on static assets/_next
export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
