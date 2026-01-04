class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// Recharts expects ResizeObserver to exist in the environment.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = ResizeObserverMock;

// Ensure localStorage is available (jsdom should provide it, but be defensive)
if (typeof localStorage === "undefined") {
  class LocalStorageMock {
    private store: Map<string, string> = new Map();

    getItem(key: string): string | null {
      return this.store.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
      this.store.set(key, value);
    }

    removeItem(key: string): void {
      this.store.delete(key);
    }

    clear(): void {
      this.store.clear();
    }

    get length(): number {
      return this.store.size;
    }

    key(index: number): string | null {
      return Array.from(this.store.keys())[index] ?? null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).localStorage = new LocalStorageMock();
}
