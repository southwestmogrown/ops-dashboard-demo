import type { UserRole } from "@/lib/types/auth";

export const AUTH_STORAGE_KEY = "ops-auth";

export interface StoredAuth {
  role: UserRole;
  pin: string;
}

export function readClientAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export function writeClientAuth(auth: StoredAuth): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

export function clearClientAuth(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const auth = readClientAuth();

  if (auth) {
    headers.set("x-ops-role", auth.role);
    headers.set("x-ops-pin", auth.pin);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}