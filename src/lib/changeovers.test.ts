import { describe, expect, it } from "vitest";
import { getTotalChangeovers } from "./changeovers";

describe("getTotalChangeovers", () => {
  it("returns 0 when there are no hourly buckets", () => {
    expect(getTotalChangeovers()).toBe(0);
    expect(getTotalChangeovers(null)).toBe(0);
    expect(getTotalChangeovers({})).toBe(0);
  });

  it("sums all hourly changeover buckets", () => {
    expect(
      getTotalChangeovers({
        "06:00": 1,
        "07:00": 2,
        "12:00": 4,
      }),
    ).toBe(7);
  });
});
