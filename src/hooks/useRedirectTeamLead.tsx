"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export function useRedirectTeamLead(): void {
  const router = useRouter();
  const { role, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    if (role === "team-lead") {
      router.replace("/team-lead");
    }
  }, [isAuthenticated, role, router]);
}
