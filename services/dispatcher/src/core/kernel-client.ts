const DEFAULT_KERNEL_URL = "http://127.0.0.1:3000";

export type MissionResult = "created" | "deduped";

export interface KernelClientLike {
  createMission(input: MissionRequest): Promise<MissionResult>;
  getKernelUrl?(): string;
}

export interface MissionRequest {
  goal: string;
  params: Record<string, unknown>;
  idempotencyKey: string;
  maxAttempts?: number;
}

export class KernelClient implements KernelClientLike {
  constructor(private readonly baseUrl: string = process.env.KERNEL_URL ?? DEFAULT_KERNEL_URL) {}

  async createMission(input: MissionRequest): Promise<MissionResult> {
    const response = await fetch(this.buildUrl("/missions"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });

    if (response.status === 409) {
      return "deduped";
    }
    if (!response.ok) {
      const message = await response.text().catch(() => "unknown kernel error");
      throw new Error(`kernel ${response.status}: ${message}`);
    }
    return "created";
  }

  getKernelUrl(): string {
    return this.baseUrl;
  }

  private buildUrl(pathname: string): string {
    const url = new URL(pathname, this.baseUrl);
    return url.toString();
  }
}
