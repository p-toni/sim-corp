export class RuntimeTimeoutError extends Error {
  constructor(message = "Agent runtime timed out") {
    super(message);
    this.name = "RuntimeTimeoutError";
  }
}

export class RuntimeAbortError extends Error {
  constructor(message = "Agent runtime aborted") {
    super(message);
    this.name = "RuntimeAbortError";
  }
}
