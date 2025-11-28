import type { DriverFactory } from "@sim-corp/driver-core";
import { FakeDriver } from "./fake-driver";

export const createFakeDriver: DriverFactory = (cfg) => new FakeDriver(cfg);

export default createFakeDriver;
