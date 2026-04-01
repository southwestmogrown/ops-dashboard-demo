"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { UserRole, SUPERVISOR_PIN, TEAM_LEAD_PIN } from "@/lib/types/auth";
import {
  clearClientAuth,
  readClientAuth,
  writeClientAuth,
} from "@/lib/clientAuth";

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
    const parsed = readClientAuth();
    if (!parsed) return { role: null, isAuthenticated: false };
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
    const stored = readStorage();
    setAuth(stored);

    setMounted(true);
  }, []);

  const login = useCallback((pin: string, role: UserRole): boolean => {
    const expectedPin = role === "supervisor" ? SUPERVISOR_PIN : TEAM_LEAD_PIN;
    if (pin !== expectedPin) return false;
    const state = { role, isAuthenticated: true };
    writeClientAuth({ pin, role });
    setAuth(state);
    return true;
  }, []);

  const logout = useCallback(() => {
    clearClientAuth();
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
