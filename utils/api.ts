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
  const response = await fetch(url, options);

  if (response.status === 401) {
    await useAppStore.getState().signOut();
    router.replace("/login");
  }

  return response;
}
