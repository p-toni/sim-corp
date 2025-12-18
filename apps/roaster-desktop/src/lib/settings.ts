export interface EndpointSettings {
  ingestionUrl: string;
  kernelUrl: string;
  analyticsUrl: string;
  dispatcherUrl?: string;
}

export const defaultEndpointSettings: EndpointSettings = {
  ingestionUrl: "http://127.0.0.1:4001",
  kernelUrl: "http://127.0.0.1:4000",
  analyticsUrl: "http://127.0.0.1:4006",
  dispatcherUrl: "http://127.0.0.1:4010"
};

const STORAGE_KEY = "artisan.endpoint-settings";
let runtimeSettings: EndpointSettings = { ...defaultEndpointSettings };
const listeners = new Set<(settings: EndpointSettings) => void>();

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const globalWindow = window as unknown as Record<string, unknown>;
  return "__TAURI_IPC__" in globalWindow || "__TAURI_METADATA__" in globalWindow;
}

async function getStore(): Promise<import("tauri-plugin-store-api").Store | null> {
  if (!isTauriRuntime()) return null;
  try {
    const dynamicImport = new Function("specifier", "return import(specifier);") as <T>(
      specifier: string
    ) => Promise<T>;
    const { Store } = await dynamicImport<{ Store: new (path: string) => import("tauri-plugin-store-api").Store }>(
      "tauri-plugin-store-api"
    );
    return new Store("artisan-settings.bin");
  } catch (err) {
    console.warn("Tauri store unavailable, falling back to localStorage", err);
    return null;
  }
}

function notify(settings: EndpointSettings): void {
  listeners.forEach((listener) => listener(settings));
}

function readFromLocalStorage(): Partial<EndpointSettings> | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<EndpointSettings>;
  } catch (err) {
    console.warn("Failed to parse stored endpoint settings", err);
    return null;
  }
}

async function readFromStore(): Promise<Partial<EndpointSettings> | null> {
  try {
    const store = await getStore();
    if (!store) return null;
    const value = await store.get<Partial<EndpointSettings>>(STORAGE_KEY);
    return value ?? null;
  } catch (err) {
    console.warn("Failed to read endpoint settings from store", err);
    return null;
  }
}

function persistToLocalStorage(settings: EndpointSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

async function persistToStore(settings: EndpointSettings): Promise<void> {
  const store = await getStore();
  if (!store) return;
  await store.set(STORAGE_KEY, settings);
  await store.save();
}

export function getEndpointSettings(): EndpointSettings {
  return runtimeSettings;
}

function applySettings(settings: EndpointSettings): EndpointSettings {
  runtimeSettings = settings;
  notify(settings);
  return settings;
}

export function subscribeToEndpointSettings(listener: (settings: EndpointSettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadEndpointSettings(): Promise<EndpointSettings> {
  const stored = (await readFromStore()) ?? readFromLocalStorage();
  const merged: EndpointSettings = { ...defaultEndpointSettings, ...(stored ?? {}) };
  return applySettings(merged);
}

export async function saveEndpointSettings(update: Partial<EndpointSettings>): Promise<EndpointSettings> {
  const next: EndpointSettings = {
    ...runtimeSettings,
    ...update
  };
  persistToLocalStorage(next);
  await persistToStore(next);
  return applySettings(next);
}
