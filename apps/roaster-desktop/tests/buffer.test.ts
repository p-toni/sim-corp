import { describe, expect, it } from "vitest";
import { appendWithLimit } from "../src/lib/types";

describe("appendWithLimit", () => {
  it("keeps items within limit", () => {
    const items = Array.from({ length: 5 }, (_, i) => i);
    const next = appendWithLimit(items, 5, 3);
    expect(next).toEqual([3, 4, 5]);
  });

  it("appends when under limit", () => {
    const items = [1, 2];
    const next = appendWithLimit(items, 3, 5);
    expect(next).toEqual([1, 2, 3]);
  });
});
