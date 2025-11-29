import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { DriverConfig } from "@sim-corp/driver-core";
import { TcpLineDriver } from "../src/driver";

function createServer(
  lines: string[],
  options?: { closeAfter?: number; port?: number; intervalMs?: number }
): Promise<{ port: number; close: () => Promise<void>; connections: () => number }> {
  return new Promise((resolve) => {
    let connections = 0;
    const sockets: net.Socket[] = [];
    const server = net.createServer((socket) => {
      connections += 1;
       sockets.push(socket);
      if (process.env.TCP_LINE_DEBUG === "1") {
        // eslint-disable-next-line no-console
        console.log(`[tcp-line:test] server accepted connection #${connections}`);
      }
      const interval = options?.intervalMs ?? 20;
      lines.forEach((line, idx) => {
        setTimeout(() => {
          if (process.env.TCP_LINE_DEBUG === "1") {
            // eslint-disable-next-line no-console
            console.log(`[tcp-line:test] sending line: ${line}`);
          }
          socket.write(`${line}\n`);
        }, 50 + idx * interval);
      });
      if (options?.closeAfter) {
        setTimeout(() => socket.end(), options.closeAfter);
      }
    });
    server.listen(options?.port ?? 0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        port,
        connections: () => connections,
        close: async () =>
          await new Promise<void>((res) => {
            sockets.forEach((s) => s.destroy());
            server.close(() => res());
          })
      });
    });
  });
}

async function waitFor(fn: () => boolean, timeoutMs = 5000, intervalMs = 20, onTimeout?: () => string): Promise<void> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (fn()) return;
    if (Date.now() - start > timeoutMs) {
      const extra = onTimeout ? `: ${onTimeout()}` : "";
      throw new Error(`waitFor timed out${extra}`);
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
}

describe.sequential("TcpLineDriver", () => {
  let driver: TcpLineDriver;

  afterEach(async () => {
    await driver?.disconnect?.();
  });

  it("parses jsonl frames and applies offsets", async () => {
    const now = new Date().toISOString();
    const server = await createServer([`{"ts":"${now}","btC":190,"etC":200}`]);
    const cfg: DriverConfig = {
      orgId: "o",
      siteId: "s",
      machineId: "m",
      connection: { host: "127.0.0.1", port: server.port, offsets: { btC: 5 } }
    };
    driver = new TcpLineDriver(cfg);
    await driver.connect();
    await waitFor(() => server.connections() > 0, 5000, () => `connections=${server.connections()}`);
    await waitFor(() => driver.getStatus().state === "CONNECTED", 5000, () => JSON.stringify(driver.getStatus()));
    if (process.env.TCP_LINE_DEBUG === "1") {
      // eslint-disable-next-line no-console
      console.log("[tcp-line:test] reading telemetry (json)", JSON.stringify(driver.getStatus()));
    }
    const point = await driver.readTelemetry();
    expect(point.btC).toBe(195);
    expect(point.etC).toBe(200);
    expect(point.extras).toEqual({});
    await server.close();
  }, 20000);

  it("emits on cadence and keeps last sample", async () => {
    const now = Date.now();
    const lines = Array.from({ length: 12 }, (_v, idx) => {
      return JSON.stringify({
        ts: new Date(now + idx * 100).toISOString(),
        btC: 170 + idx,
        customChannel: idx * 2
      });
    });
    const server = await createServer(lines, { intervalMs: 10 });
    const emitIntervalMs = 100;
    const cfg: DriverConfig = {
      orgId: "o",
      siteId: "s",
      machineId: "m",
      connection: { host: "127.0.0.1", port: server.port, emitIntervalMs, dedupeWithinMs: 0 }
    };
    driver = new TcpLineDriver(cfg);
    await driver.connect();
    await waitFor(() => server.connections() > 0, 5000, () => `connections=${server.connections()}`);
    await waitFor(() => driver.getStatus().state === "CONNECTED", 5000, () => JSON.stringify(driver.getStatus()));
    await waitFor(
      () => driver.getStatus().metrics.linesParsed >= 3,
      8000,
      () => JSON.stringify(driver.getStatus())
    );

    const emitted: Array<{ at: number; btC?: number; elapsedSeconds: number; extras?: Record<string, unknown> }> =
      [];
    for (let i = 0; i < 4; i++) {
      await new Promise((res) => setTimeout(res, emitIntervalMs));
      if (process.env.TCP_LINE_DEBUG === "1") {
        // eslint-disable-next-line no-console
        console.log("[tcp-line:test] reading telemetry (cadence)", JSON.stringify(driver.getStatus()));
      }
      const point = await driver.readTelemetry();
      emitted.push({ at: Date.now(), btC: point.btC, elapsedSeconds: point.elapsedSeconds, extras: point.extras });
    }

    const gaps = emitted.slice(1).map((item, idx) => item.at - emitted[idx].at);
    gaps.forEach((gap) => expect(gap).toBeGreaterThanOrEqual(emitIntervalMs * 0.6));
    expect(emitted[emitted.length - 1].elapsedSeconds).toBeGreaterThan(0);
    expect(emitted[0].extras?.customChannel).toBeGreaterThan(0);
    expect(emitted[0].extras?.customChannel).toBe(emitted[emitted.length - 1].extras?.customChannel);
    expect(driver.getStatus().metrics.telemetryEmitted).toBeGreaterThanOrEqual(emitted.length);
    await server.close();
  }, 25000);

  it("reconnects after server closes", async () => {
    const server = await createServer([`{"btC":180}`], { closeAfter: 80 });
    const cfg: DriverConfig = {
      orgId: "o",
      siteId: "s",
      machineId: "m",
      connection: {
        host: "127.0.0.1",
        port: server.port,
        reconnect: { minBackoffMs: 10, maxBackoffMs: 20 },
        dedupeWithinMs: 0
      }
    };
    driver = new TcpLineDriver(cfg);
    await driver.connect();
    await waitFor(() => server.connections() > 0, 5000, () => `connections=${server.connections()}`);
    await waitFor(() => driver.getStatus().state === "CONNECTED", 5000, () => JSON.stringify(driver.getStatus()));
    await waitFor(
      () => driver.getStatus().metrics.linesParsed > 0,
      8000,
      () => JSON.stringify(driver.getStatus())
    );
    await server.close();

    const server2 = await createServer([`{"btC":181}`], { port: cfg.connection.port as number });
    await waitFor(() => server2.connections() > 0, 5000, () => `connections=${server2.connections()}`);
    await waitFor(() => driver.getStatus().state === "CONNECTED", 5000, () => JSON.stringify(driver.getStatus()));
    if (process.env.TCP_LINE_DEBUG === "1") {
      // eslint-disable-next-line no-console
      console.log("[tcp-line:test] status before second sample", JSON.stringify(driver.getStatus()));
    }
    await waitFor(
      () => driver.getStatus().metrics.linesParsed >= 2,
      10000,
      () => JSON.stringify(driver.getStatus())
    );
    if (process.env.TCP_LINE_DEBUG === "1") {
      // eslint-disable-next-line no-console
      console.log("[tcp-line:test] reading telemetry (reconnect)", JSON.stringify(driver.getStatus()));
    }
    const point = await driver.readTelemetry();
    expect(point.btC).toBe(181);
    await server2.close();
  }, 20000);

  it("parses csv frames and counts parse errors", async () => {
    const server = await createServer(["ts,btC,etC", "bad-line", "2025-01-01T00:00:00.000Z,185,195"]);
    const cfg: DriverConfig = {
      orgId: "o",
      siteId: "s",
      machineId: "m",
      connection: {
        host: "127.0.0.1",
        port: server.port,
        format: "csv",
        csv: { hasHeader: true, delimiter: ",", columns: [] }
      }
    };
    driver = new TcpLineDriver(cfg);
    await driver.connect();
    await waitFor(() => server.connections() > 0, 5000, () => `connections=${server.connections()}`);
    await waitFor(() => driver.getStatus().state === "CONNECTED", 5000, () => JSON.stringify(driver.getStatus()));
    await waitFor(
      () => driver.getStatus().metrics.linesParsed > 0,
      8000,
      () => JSON.stringify(driver.getStatus())
    );
    await waitFor(
      () => driver.getStatus().metrics.parseErrors >= 1,
      8000,
      () => JSON.stringify(driver.getStatus())
    );
    if (process.env.TCP_LINE_DEBUG === "1") {
      // eslint-disable-next-line no-console
      console.log("[tcp-line:test] reading telemetry (csv)", JSON.stringify(driver.getStatus()));
    }
    const point = await driver.readTelemetry();
    expect(point.btC).toBe(185);
    expect(point.etC).toBe(195);
    expect(point.extras).toEqual({});
    await server.close();
  }, 20000);
});
