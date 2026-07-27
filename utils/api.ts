import { router } from "expo-router";
import { API_BASE_URL } from "@/utils/constants";
import { handleUnauthorized } from "@/utils/session";

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, options);

  if (response.status === 401) {
    await handleUnauthorized();
    router.replace("/login");
  }

  return response;
}
