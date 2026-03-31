"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { UserRole, SUPERVISOR_PIN, TEAM_LEAD_PIN } from "@/lib/authTypes";

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
  if (typeof window === "undefined")
    return { role: null, isAuthenticated: false };
  try {
    const raw = localStorage.getItem("ops-auth");
    if (!raw) return { role: null, isAuthenticated: false };
    const parsed = JSON.parse(raw) as { pin: string; role: UserRole };
    const expectedPin =
      parsed.role === "supervisor" ? SUPERVISOR_PIN : TEAM_LEAD_PIN;
    return { role: parsed.role, isAuthenticated: parsed.pin === expectedPin };
  } catch {
    return { role: null, isAuthenticated: false };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Start null to avoid hydration mismatch — server always renders with no auth,
  // client reads localStorage after mount via useEffect.
  const [auth, setAuth] = useState<AuthState>({
    role: null,
    isAuthenticated: false,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setAuth(readStorage());
    setMounted(true);
  }, []);

  const login = useCallback((pin: string, role: UserRole): boolean => {
    const expectedPin = role === "supervisor" ? SUPERVISOR_PIN : TEAM_LEAD_PIN;
    if (pin !== expectedPin) return false;
    const state = { role, isAuthenticated: true };
    localStorage.setItem("ops-auth", JSON.stringify({ pin, role }));
    document.cookie = `ops-role=${role}; path=/; max-age=86400`;
    setAuth(state);
    return true;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("ops-auth");
    document.cookie = "ops-role=; path=/; max-age=0";
    setAuth({ role: null, isAuthenticated: false });
  }, []);

  // Suppress children until mounted — prevents flash of PinGate for authenticated users
  if (!mounted)
    return (
      <AuthContext.Provider
        value={{ role: null, isAuthenticated: false, login, logout }}
      >
        {null}
      </AuthContext.Provider>
    );

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
