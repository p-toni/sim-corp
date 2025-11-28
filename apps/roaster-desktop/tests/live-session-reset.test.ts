import { describe, expect, it } from "vitest";
import { appendWithLimit } from "../src/lib/types";

describe("session buffer reset helper", () => {
  it("keeps limit when appending", () => {
    const buf = appendWithLimit([1, 2], 3, 2);
    expect(buf).toEqual([2, 3]);
  });
});
