// middleware.ts
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
  "/inventory(.*)", // CHANGE: include inventory if you want it protected too
]);

// CHANGE: helper to build a public return URL on Render/proxied environments
function getPublicReturnBackUrl(req: Request) {
  const url = new URL(req.url);

  const forwardedProto =
    req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const forwardedHost = req.headers.get("x-forwarded-host") || url.host;

  return `${forwardedProto}://${forwardedHost}${url.pathname}${url.search}`;
}

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  if (isProtectedRoute(req)) {
    const a = await auth();

    if (!a.userId) {
      // CHANGE: use public forwarded URL instead of req.url directly
      return a.redirectToSignIn({
        returnBackUrl: getPublicReturnBackUrl(req),
      });
    }
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
