export function getTotalChangeovers(
  hourlyChangeovers?: Record<string, number> | null,
): number {
  if (!hourlyChangeovers) return 0;
  return Object.values(hourlyChangeovers).reduce(
    (sum, count) => sum + count,
    0,
  );
}
