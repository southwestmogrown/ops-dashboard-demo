"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { UserRole } from "@/lib/authTypes";

export default function PinGate() {
  const { login } = useAuth();
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<UserRole>("supervisor");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit() {
    setLoading(true);
    setError("");
    const ok = login(pin, role);
    if (!ok) {
      setError("Incorrect PIN. Please try again.");
      setLoading(false);
      return;
    }
    // Auth succeeded — state update triggers useEffect in AuthProviders to redirect
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-surface border border-border rounded-xl p-8 w-full max-w-sm shadow-2xl">
        {/* BAK Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-accent text-black font-black text-sm px-3 py-1.5 rounded tracking-widest mb-2">
            BAK
          </div>
          <div className="text-slate-500 text-xs tracking-widest uppercase">
            RealTruck · Ops Dashboard
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <label className="block text-xs text-slate-500 tracking-widest uppercase mb-2">
              Enter PIN
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              className="w-full bg-background border border-border rounded-lg px-4 py-3 text-center text-slate-200 text-lg tracking-widest tracking-wider focus:outline-none focus:border-accent transition-colors"
              placeholder="••••••"
              maxLength={20}
              autoComplete="off"
              autoFocus
            />
            {error && (
              <p className="mt-2 text-status-red text-xs text-center">
                {error}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-500 tracking-widest uppercase mb-2">
              Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole("supervisor")}
                className={`px-3 py-2 rounded-lg text-xs tracking-widest uppercase border transition-colors ${
                  role === "supervisor"
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-slate-500 hover:text-slate-300"
                }`}
              >
                Supervisor
              </button>
              <button
                type="button"
                onClick={() => setRole("team-lead")}
                className={`px-3 py-2 rounded-lg text-xs tracking-widest uppercase border transition-colors ${
                  role === "team-lead"
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-slate-500 hover:text-slate-300"
                }`}
              >
                Team Lead
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={loading || !pin}
            onClick={handleSubmit}
            className="mt-2 w-full bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm tracking-widest uppercase py-3 rounded-lg transition-colors"
          >
            Sign In
          </button>

          <p className="text-xs text-slate-600 text-center mt-4">
            {role === "supervisor"
              ? "Supervisor PIN: bak2026"
              : "Team Lead PIN: lead2026"}
          </p>
        </div>
      </div>
    </div>
  );
}
