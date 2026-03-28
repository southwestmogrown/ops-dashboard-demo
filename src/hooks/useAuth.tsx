"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { UserRole, AUTH_PIN } from "@/lib/authTypes";

interface AuthState {
  role: UserRole | null;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (pin: string, role: UserRole) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStorage(): AuthState {
  if (typeof window === "undefined") return { role: null, isAuthenticated: false };
  try {
    const raw = localStorage.getItem("ops-auth");
    if (!raw) return { role: null, isAuthenticated: false };
    const parsed = JSON.parse(raw) as { pin: string; role: UserRole };
    return { role: parsed.role, isAuthenticated: parsed.pin === AUTH_PIN };
  } catch {
    return { role: null, isAuthenticated: false };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => readStorage());

  const login = useCallback((pin: string, role: UserRole): boolean => {
    if (pin !== AUTH_PIN) return false;
    const state = { role, isAuthenticated: true };
    localStorage.setItem("ops-auth", JSON.stringify({ pin, role }));
    document.cookie = `ops-role=${role}; path=/`;
    setAuth(state);
    return true;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("ops-auth");
    document.cookie = "ops-role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setAuth({ role: null, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
