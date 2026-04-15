import { router } from "expo-router";
import { useAppStore } from "@/store/store";

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
