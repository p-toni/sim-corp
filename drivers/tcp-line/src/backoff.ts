export class Backoff {
  private current: number;

  constructor(private readonly minMs: number, private readonly maxMs: number) {
    this.current = minMs;
  }

  next(): number {
    const value = this.current;
    this.current = Math.min(this.maxMs, Math.max(this.minMs, this.current * 2));
    return value;
  }

  reset(): void {
    this.current = this.minMs;
  }
}
