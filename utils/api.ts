import { router } from "expo-router";
import { API_BASE_URL } from "@/utils/constants";
import { handleUnauthorized } from "@/utils/session";
import { addBreadcrumb, captureWarning } from "@/utils/sentry";

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/** Strips query strings, which can carry ids and tokens, from breadcrumb paths. */
function safePath(url: string): string {
  return url.split("?")[0].replace(API_BASE_URL, "");
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = options.method ?? "GET";
  // Whether the header was attached at all is the diagnostic that mattered for
  // the sign-in bounce — a request that reaches here unauthenticated 401s and
  // trips the global sign-out below. The token itself is never recorded, and
  // its length is no longer recorded either: length leaks structure for no
  // diagnostic gain now that the trail is queryable in Sentry.
  const authHeader = (options.headers as Record<string, string> | undefined)
    ?.Authorization;

  addBreadcrumb("http", `${method} ${safePath(url)}`, {
    auth: authHeader ? "present" : "missing",
  });

  const response = await fetch(url, options);

  addBreadcrumb("http", `${response.status} ${safePath(url)}`, {
    status: response.status,
  });

  if (response.status === 401) {
    // Warning, not an exception: an expired token is ordinary, so this is a
    // rate not a defect. The value is the breadcrumb trail above it, which
    // shows whether the request went out with a token at all — the difference
    // between a normal session expiry and the bounce bug.
    captureWarning("global 401 sign-out", {
      method,
      path: safePath(url),
      auth: authHeader ? "present" : "missing",
    });
    await handleUnauthorized();
    router.replace("/login");
  }

  return response;
}
