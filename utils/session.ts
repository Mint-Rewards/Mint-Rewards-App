/**
 * Indirection between the 401 boundary (`utils/api.ts`) and the store.
 *
 * `authenticatedFetch` must sign the user out on 401, but importing the store
 * from `utils/api.ts` creates a require cycle (store -> api -> store), which
 * Metro warns about and which can hand a module a half-initialized import.
 * The store registers its `signOut` here at module scope instead, so the
 * dependency runs one way: store -> api -> session, store -> session.
 */

type UnauthorizedHandler = () => void | Promise<void>;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

/**
 * No-ops if the store module has not been evaluated yet. In practice every
 * `authenticatedFetch` caller lives in the store, so the handler is always
 * registered by the time a 401 can arrive.
 */
export async function handleUnauthorized(): Promise<void> {
  await unauthorizedHandler?.();
}
