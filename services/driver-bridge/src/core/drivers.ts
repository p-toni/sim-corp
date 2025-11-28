import type { DriverFactory } from "@sim-corp/driver-core";
import { createFakeDriver } from "@sim-corp/driver-fake";

const DRIVER_MAP: Record<string, DriverFactory> = {
  fake: createFakeDriver
};

export function loadDriver(name: string): DriverFactory {
  const key = name.toLowerCase();
  const factory = DRIVER_MAP[key];
  if (!factory) {
    throw new Error(`Driver not found: ${name}`);
  }
  return factory;
}
