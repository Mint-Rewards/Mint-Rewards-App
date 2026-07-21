import { router } from "expo-router";
import { useAppStore } from "@/store/store";
import { API_BASE_URL } from "@/utils/constants";

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // TEMP DIAGNOSTIC — remove once the sign-in bounce is diagnosed.
  // Never log the token itself; presence/length only.
  const authHeader = (options.headers as Record<string, string> | undefined)?.Authorization;
  console.log(
    `[authFetch] -> ${options.method ?? "GET"} ${url} auth=${
      authHeader ? `present(len:${authHeader.length})` : "MISSING"
    }`
  );

  const response = await fetch(url, options);

  console.log(`[authFetch] <- ${response.status} ${url}`);

  if (response.status === 401) {
    console.warn(`[authFetch] 401 -> FORCING SIGN-OUT + redirect to /login. url=${url}`);
    await useAppStore.getState().signOut();
    router.replace("/login");
  }

  return response;
}
