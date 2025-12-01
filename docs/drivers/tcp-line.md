# TCP Line Driver (T-020 shadow-mode)

This driver ingests newline-delimited telemetry over TCP using a Rust N-API addon plus a thin TS adapter and publishes the usual MQTT telemetry envelopes. Use it to shadow real hardware via a serial→TCP bridge (e.g. `socat`) without touching actuation. Packaging ships the compiled `index.node` (or requires a Rust toolchain to build); driver state/metrics are exposed at `/bridge/status` via driver-bridge.

## Protocol

- One frame per line (`\n`)
- Formats:
  - **jsonl (recommended)**: `{"ts":"2025-11-28T21:10:10.123Z","btC":196.4,"etC":214.9,"powerPct":62,"fanPct":45,"drumRpm":52}`
  - **csv**: `2025-11-28T21:10:10.123Z,196.4,214.9,62,45,52` (columns configured; default order `ts,btC,etC,powerPct,fanPct,drumRpm` if you omit `csv.columns`)
- If `ts` is missing, receipt time is used. Offsets applied to `btC`/`etC`. Unknown numeric/string fields land in `extras`.

## Driver config (env)

- `DRIVER_KIND=tcp-line`
- `DRIVER_TCP_LINE_CONFIG_JSON`, e.g.:
```json
{
  "host": "127.0.0.1",
  "port": 5555,
  "format": "jsonl",
  "emitIntervalMs": 1000,
  "dedupeWithinMs": 200,
  "offsets": { "btC": 0, "etC": 0 },
  "reconnect": { "enabled": true, "minBackoffMs": 250, "maxBackoffMs": 5000 },
  "csv": { "hasHeader": true, "columns": ["ts","btC","etC","powerPct","fanPct","drumRpm"], "delimiter": "," }
}
```
- `emitIntervalMs` is mirrored to bridge `sampleIntervalSeconds` (defaults to 1000 ms when omitted).

## Serial → TCP bridge (socat)

Expose a USB serial device on a TCP port:
```bash
# macOS example (replace /dev/tty.usbserial-XXXX)
socat -d -d PTY,raw,echo=0,link=/tmp/roaster-tty TCP-LISTEN:5555,reuseaddr
# Linux example
socat -d -d FILE:/dev/ttyUSB0,raw,echo=0 TCP-LISTEN:5555,reuseaddr
```
Point the driver at `host=127.0.0.1`, `port=5555`.

### Quick JSONL shim (optional)

If your serial device emits plain text lines, wrap them into JSONL before handing them to the TCP socket:
```ts
// serial-to-jsonl.ts
import net from "node:net";
import readline from "node:readline";

const sink = net.createServer((socket) => {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    const numeric = Number(line);
    const frame = { ts: new Date().toISOString(), btC: Number.isFinite(numeric) ? numeric : undefined, raw: line };
    socket.write(`${JSON.stringify(frame)}\n`);
  });
});

sink.listen(5555, "127.0.0.1", () => {
  console.log("Forwarding stdin as JSONL on tcp://127.0.0.1:5555");
});
```
Run with `node serial-to-jsonl.ts < /dev/ttyUSB0` while the driver listens on the same port.

## Bring-up checklist

1. Start `socat` (or your TCP source) and `nc 127.0.0.1 5555` to confirm lines stream.
2. Start driver-bridge with `DRIVER_KIND=tcp-line` and config JSON above.
3. Check `GET /bridge/status` → driver state `CONNECTED`, metrics increasing.
4. Verify ingestion telemetry:
   - `curl "http://127.0.0.1:4001/telemetry?orgId=org&siteId=site&machineId=machine&limit=3"`
   - or SSE stream: `curl http://127.0.0.1:4001/stream/telemetry?orgId=org&siteId=site&machineId=machine`
5. Close session (DROP event or silence) → mission enqueued → report generated:
   - `curl "http://127.0.0.1:4001/sessions/<SESSION_ID>/reports/latest?reportKind=POST_ROAST_V1"`
6. For debugging: `/bridge/status` shows tcp-line state plus metrics (linesReceived, parseErrors, reconnects, lastError, lastLineAt).

## Notes

- Reconnect/backoff is built-in; malformed lines count parseErrors but don’t crash.
- MQTT publishing is unchanged: `roaster/{org}/{site}/{machine}/telemetry` envelopes with idempotent sessionization/report loop.
