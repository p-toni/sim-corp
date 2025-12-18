declare module "tauri-plugin-store-api" {
  export class Store {
    constructor(path: string);
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
    save(): Promise<void>;
  }
}
