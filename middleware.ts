import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/alert(.*)",
  "/memo(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const isProtectedRoute = createRouteMatcher([
  "/scan(.*)",
  "/manager(.*)",
  "/checklist(.*)",
  "/manager.csv(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  if (isProtectedRoute(req)) {
    const a = await auth();

    if (!a.userId) {
      return a.redirectToSignIn({
        returnBackUrl: req.url,
      });
    }
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
