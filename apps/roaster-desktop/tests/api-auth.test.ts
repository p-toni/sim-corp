import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { listProfiles, setAuthTokenProvider } from "../src/lib/api";

const originalFetch = global.fetch;

describe("api auth token attachment", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setAuthTokenProvider(async () => null);
  });

  it("adds bearer token when provided", async () => {
    setAuthTokenProvider(async () => "abc123");
    await listProfiles("http://example.com", { orgId: "org" });
    expect(global.fetch).toHaveBeenCalled();
    const call = (global.fetch as unknown as vi.Mock).mock.calls[0];
    const init = call[1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer abc123");
  });
});
