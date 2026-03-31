export type UserRole = "supervisor" | "team-lead";

export const SUPERVISOR_PIN = process.env.SUPERVISOR_PIN ?? "bak2026";
export const TEAM_LEAD_PIN = process.env.TEAM_LEAD_PIN ?? "lead2026";

export function getPinForRole(role: UserRole): string {
  return role === "supervisor" ? SUPERVISOR_PIN : TEAM_LEAD_PIN;
}
