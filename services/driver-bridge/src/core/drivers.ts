import type { DriverFactory } from "@sim-corp/driver-core";
import { createFakeDriver } from "@sim-corp/driver-fake";
import { createTcpLineDriver } from "@sim-corp/driver-tcp-line";

const DRIVER_MAP: Record<string, DriverFactory> = {
  fake: createFakeDriver,
  "tcp-line": createTcpLineDriver
};

export function loadDriver(name: string): DriverFactory {
  const key = name.toLowerCase();
  const factory = DRIVER_MAP[key];
  if (!factory) {
    throw new Error(`Driver not found: ${name}`);
  }
  return factory;
}
