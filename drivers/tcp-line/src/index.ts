import type { DriverConfig, DriverFactory } from "@sim-corp/driver-core";
import { TcpLineDriver } from "./driver";

export const createTcpLineDriver: DriverFactory = (cfg: DriverConfig) => new TcpLineDriver(cfg);

export default createTcpLineDriver;
