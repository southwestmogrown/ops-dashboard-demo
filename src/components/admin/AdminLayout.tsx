"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) return;
    if (role === "team-lead") {
      router.replace("/team-lead");
    }
  }, [role, isAuthenticated, router]);

  if (!isAuthenticated) return null;
  if (role === "team-lead") return null;

  return <>{children}</>;
}
