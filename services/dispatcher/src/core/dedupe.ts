export interface RecordedError {
  at: string;
  message: string;
  meta?: unknown;
}

export class ErrorBuffer {
  private readonly errors: RecordedError[] = [];

  constructor(private readonly limit = 20) {}

  push(message: string, meta?: unknown): void {
    this.errors.unshift({ at: new Date().toISOString(), message, meta });
    if (this.errors.length > this.limit) {
      this.errors.length = this.limit;
    }
  }

  list(): RecordedError[] {
    return [...this.errors];
  }
}
