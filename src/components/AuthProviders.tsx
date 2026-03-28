"use client";

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import PinGate from "@/components/PinGate";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return (
    <>
      {children}
      {!isAuthenticated && <PinGate />}
    </>
  );
}

export default function AuthProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
