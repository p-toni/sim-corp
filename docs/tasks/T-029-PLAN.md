# T-029: Bullet R1 USB Driver Implementation Plan

**Status:** PLANNED (blocked on hardware access)
**Milestone:** Post-M3 (Pilot Hardware)
**Prerequisite:** T-029a (Protocol Recon) — **COMPLETE**
**Priority:** Optional for M3 (tcp-line driver already sufficient)

## Overview

Implement a read-only USB driver for the Aillio Bullet R1 V2 coffee roaster to enable real-time telemetry ingestion from pilot hardware. This driver will integrate with the existing shadow driver pipeline (T-011) to provide identical functionality to the tcp-line driver (T-020), but with direct USB communication instead of serial-to-TCP bridging.

## Success Criteria

1. **Read-only telemetry:** Driver reads BT, DT, IBTS, fan, heater, drum, state
2. **Real-time streaming:** Telemetry published to MQTT at ≥1 Hz
3. **State machine tracking:** Roaster state (OFF, Pre-heating, Roasting, Cooling, etc.) accurately reported
4. **Cross-platform:** Works on Linux, macOS, Windows with appropriate USB drivers
5. **Zero interference:** Does NOT interfere with RoasTime or manual roaster operation
6. **Error resilience:** Handles USB disconnection/reconnection gracefully
7. **Tests passing:** Integration tests with real hardware validate all telemetry fields

## Non-Goals (Out of Scope)

- **Write operations:** NO control commands (heater, fan, drum, PRS button)
  - Rationale: M3 only requires shadow telemetry; control requires M4-level safety infrastructure
- **RoasTime replacement:** Not a full roasting software
- **Firmware updates:** No support for device firmware management
- **Calibration:** No temperature calibration or offset adjustment

## Architecture

### Component Structure

```
┌─────────────────────────────────────────────────────────┐
│  Sim-Corp Ingestion Pipeline                            │
│  ┌───────────────────────────────────────────────────┐  │
│  │  MQTT Broker (Mosquitto)                          │  │
│  └────────────▲──────────────────────────────────────┘  │
│               │                                          │
│               │ Telemetry envelopes                      │
│               │ (topic: telemetry/{orgId}/{machineId})  │
│               │                                          │
│  ┌────────────┴──────────────────────────────────────┐  │
│  │  Driver Bridge (services/driver-bridge)           │  │
│  │  - Polls driver at configured frequency           │  │
│  │  - Wraps telemetry in envelopes                   │  │
│  │  - Publishes to MQTT                              │  │
│  └────────────▲──────────────────────────────────────┘  │
│               │                                          │
│               │ Driver.read() interface                  │
│               │                                          │
│  ┌────────────┴──────────────────────────────────────┐  │
│  │  Bullet R1 Driver (drivers/bullet-r1-usb)         │  │
│  │  - Rust N-API module (USB via rusb crate)         │  │
│  │  - TypeScript adapter layer                       │  │
│  │  - Implements Driver interface (read-only)        │  │
│  └────────────▲──────────────────────────────────────┘  │
│               │                                          │
│               │ USB bulk transfers                       │
│               │                                          │
│  ┌────────────┴──────────────────────────────────────┐  │
│  │  Aillio Bullet R1 V2 Hardware                     │  │
│  │  VID: 0x0483, PID: 0x5741/0xa27e                  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Technology Stack

**Rust N-API Module** (similar to tcp-line driver, T-020):
- **Crate:** `rusb` (libusb bindings for Rust)
- **Build:** `napi-rs` for Node.js integration
- **Platform support:** Linux, macOS, Windows
- **Rationale:** Rust provides memory safety for USB operations; N-API enables seamless TS/JS integration

**TypeScript Adapter:**
- Wraps Rust module with Driver interface
- Handles telemetry point construction
- Error handling and reconnection logic

## Implementation Phases

### Phase 1: Rust USB Core (P0)

**Deliverables:**
- Rust crate in `drivers/bullet-r1-usb/native/`
- USB device enumeration and connection
- Info query (serial number, firmware version, roast count)
- Status polling (128-byte dual-packet read)
- Binary data parsing (little-endian floats, integers)
- State machine decoding
- Graceful disconnect handling

**Testing:**
- Unit tests for data parsing (mock 128-byte packets)
- Integration tests with real hardware (requires Bullet R1)
- Cross-platform builds (Linux, macOS, Windows)

**Acceptance:**
- `cargo test` passes on all platforms
- Successfully connects to Bullet R1 hardware
- Reads all telemetry fields with correct values
- Handles USB disconnect/reconnect without crashing

### Phase 2: TypeScript Driver Adapter (P0)

**Deliverables:**
- `drivers/bullet-r1-usb/src/bullet-r1-driver.ts`
- Implements `Driver` interface from `drivers/core`
- Constructor: `new BulletR1Driver(config: { deviceSerial?: string })`
- Methods:
  - `read(): Promise<TelemetryPoint | null>`
  - `getMetadata(): DriverMetadata`
  - Optional: `writeCommand()`, `abortCommand()`, `getCommandStatus()` (stubs returning errors)
- Error handling with exponential backoff for reconnection
- Logging with structured context

**Testing:**
- TypeScript unit tests (mocked Rust module)
- Integration tests with real hardware
- Error scenarios (disconnect, invalid data, USB errors)

**Acceptance:**
- `pnpm --filter @sim-corp/driver-bullet-r1-usb test` passes
- Driver-bridge successfully polls driver at 1 Hz
- Telemetry envelopes published to MQTT with correct schema

### Phase 3: Driver Bridge Integration (P0)

**Deliverables:**
- Update `services/driver-bridge` to support Bullet R1 driver
- Configuration for USB driver selection
- Environment variables:
  - `DRIVER_TYPE=bullet-r1-usb`
  - `BULLET_R1_SERIAL=<optional-serial-filter>`
  - `POLL_FREQUENCY_MS=1000` (1 Hz default)
- Docker Compose configuration for local development

**Testing:**
- End-to-end smoke test: Bullet R1 → driver → bridge → MQTT → ingestion → SQLite
- Verify telemetry appears in desktop Live Mode
- Session close triggers report generation

**Acceptance:**
- Full shadow ingestion pipeline functional
- Telemetry visible in desktop app
- Sessions persisted correctly
- No interference with RoasTime

### Phase 4: Documentation and Deployment (P0)

**Deliverables:**
- Driver usage documentation in `docs/ops/bullet-r1-driver.md`
- Installation instructions for USB drivers (libusb/WinUSB)
- Troubleshooting guide (permissions, driver conflicts, udev rules)
- Update `docs/ops/local-stack.md` with Bullet R1 configuration
- Update task registries

**Acceptance:**
- Documentation reviewed and approved
- End-to-end setup validated by third party
- T-029 marked DONE in task registries

## Technical Details

### USB Communication

**Device Identification:**
```rust
const VID: u16 = 0x0483; // STMicroelectronics
const PID_STANDARD: u16 = 0x5741;
const PID_REV3: u16 = 0xa27e;
const INTERFACE: u8 = 0x1;
const CONFIGURATION: u8 = 0x1;
```

**Endpoints:**
```rust
const EP_WRITE: u8 = 0x03; // Bulk OUT
const EP_READ: u8 = 0x81;  // Bulk IN
```

**Commands:**
```rust
const CMD_STATUS: [u8; 2] = [0x30, 0x01]; // Status query
const CMD_INFO1: [u8; 2] = [0x30, 0x02]; // Serial/firmware
const CMD_INFO2: [u8; 2] = [0x30, 0x03]; // Roast count
```

**Status Data Structure:**
```rust
struct BulletR1Status {
    // First 64 bytes
    bean_temp: f32,           // Offset 0-3
    bean_temp_ror: f32,       // Offset 4-7
    drum_temp: f32,           // Offset 8-11
    exit_temp: f32,           // Offset 16-19
    elapsed_minutes: u8,      // Offset 24
    elapsed_seconds: u8,      // Offset 25
    fan_setting: u8,          // Offset 26 (1-12)
    heater_setting: u8,       // Offset 27 (0-9)
    drum_speed: u8,           // Offset 28 (1-9)
    roaster_state: u8,        // Offset 29
    ir_temp: f32,             // Offset 32-35 (IBTS)
    pcb_temp: f32,            // Offset 36-39
    validity_flag: u8,        // Offset 41 (0x0A = valid)
    fan_rpm: u16,             // Offset 44-45
    voltage: u16,             // Offset 48-49
    coil_fan_setting: u32,    // Offset 52-55

    // Second 64 bytes
    coil_fan_secondary: u32,  // Offset 32-35 (relative)
    preheat_target: u16,      // Offset 40-41 (relative)
}
```

**State Machine:**
```rust
enum RoasterState {
    Off = 0x00,
    PreHeating = 0x02,
    Charge = 0x04,
    Roasting = 0x06,
    Cooling = 0x08,
    Shutdown = 0x09,
}
```

### TelemetryPoint Mapping

| Bullet R1 Field | TelemetryPoint Field | Type | Unit |
|-----------------|----------------------|------|------|
| `bean_temp` | `tempC` | float | °C |
| `drum_temp` | `extras.drumTempC` | float | °C |
| `ir_temp` | `extras.ibtsTempC` | float | °C |
| `exit_temp` | `extras.exitTempC` | float | °C |
| `fan_setting` | `extras.fanSetting` | int | 1-12 |
| `heater_setting` | `extras.heaterSetting` | int | 0-9 |
| `drum_speed` | `extras.drumSpeed` | int | 1-9 |
| `fan_rpm` | `extras.fanRpm` | int | RPM |
| `roaster_state` | `extras.state` | string | "OFF", "PREHEATING", etc. |
| `elapsed_minutes`, `elapsed_seconds` | `extras.elapsedSeconds` | int | seconds |

### Error Handling

1. **USB Errors:**
   - Disconnect: Return `null` from `read()`, attempt reconnect after 5s
   - Timeout: Log warning, return stale data with flag
   - Invalid data (validity_flag ≠ 0x0A): Return `null`

2. **Reconnection Strategy:**
   - Exponential backoff: 1s, 2s, 4s, 8s, max 30s
   - Re-enumerate USB devices on each retry
   - Log reconnection attempts with context

3. **Platform-Specific:**
   - **Linux:** Handle permission denied (udev rules required)
   - **macOS:** Handle driver detachment errors
   - **Windows:** Detect WinUSB vs libusb-win32 driver

### Dependencies

**Rust:**
```toml
[dependencies]
rusb = "0.9"
napi = "2.0"
napi-derive = "2.0"
byteorder = "1.5"
log = "0.4"
```

**TypeScript:**
```json
{
  "dependencies": {
    "@sim-corp/schemas": "workspace:*",
    "@napi-rs/cli": "^2.18.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "vitest": "^2.1.9"
  }
}
```

## Blockers and Risks

### Blockers

1. **Hardware Access:** Requires physical Bullet R1 V2 unit for development and testing
   - **Mitigation:** Defer to pilot-readiness phase when hardware available
   - **Alternative:** Use tcp-line driver (T-020) for M3

2. **USB Driver Conflicts:** RoasTime may lock USB device
   - **Mitigation:** Document requirement to close RoasTime before using driver
   - **Future:** Investigate USB device sharing (may require kernel-level changes)

3. **Firmware Variations:** Protocol may differ across firmware versions
   - **Mitigation:** Test with multiple firmware versions during pilot phase
   - **Fallback:** Document supported firmware versions

### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Protocol changes in new firmware | High | Medium | Version detection, graceful degradation |
| Platform-specific USB issues | Medium | High | Comprehensive platform testing, CI matrix |
| Performance (USB latency) | Low | Low | Profile with real hardware, optimize if needed |
| Interference with RoasTime | Medium | High | Document mutual exclusivity, detect conflicts |
| Driver installation complexity | Medium | Medium | Provide automated setup scripts, Docker images |

## Testing Strategy

### Unit Tests (No Hardware Required)

- Data parsing: Mock 128-byte status packets
- State machine transitions
- TelemetryPoint construction
- Error handling (invalid data, out-of-range values)

### Integration Tests (Hardware Required)

- USB connection establishment
- Status polling at 1 Hz
- All telemetry fields validated against known roast
- Disconnect/reconnect scenarios
- Long-duration roasts (60+ minutes)
- Cross-platform validation (Linux, macOS, Windows)

### End-to-End Tests

- Full shadow ingestion pipeline
- Desktop Live Mode displays telemetry
- Session close generates report
- Trust metrics (if device identity enabled)
- Analytics variance detection

## Deployment

### Local Development

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Build Rust USB module
cd drivers/bullet-r1-usb/native
cargo build --release

# Install Node.js dependencies
cd ..
pnpm install

# Run tests (requires hardware)
pnpm test

# Start driver bridge
cd ../../services/driver-bridge
DRIVER_TYPE=bullet-r1-usb pnpm dev
```

### Docker Compose

```yaml
services:
  driver-bridge:
    image: sim-corp/driver-bridge:latest
    environment:
      - DRIVER_TYPE=bullet-r1-usb
      - MQTT_BROKER_URL=mqtt://mosquitto:1883
      - POLL_FREQUENCY_MS=1000
    devices:
      - /dev/bus/usb:/dev/bus/usb  # USB device passthrough
    privileged: true  # Required for USB access
```

### Production (Pilot Sites)

- Pre-built binaries for Linux (amd64, arm64), macOS (x86_64, arm64), Windows (x64)
- Installer scripts handle USB driver installation
- Systemd service (Linux) or launchd (macOS) for auto-start
- Windows Service wrapper for background operation
- Logging to journald/syslog with structured context

## Timeline Estimate

**Note:** Timeline depends on hardware availability.

| Phase | Effort | Dependencies | Completion Criteria |
|-------|--------|--------------|---------------------|
| Phase 1: Rust USB Core | 2-3 days | Bullet R1 hardware | Tests passing, telemetry validated |
| Phase 2: TS Adapter | 1 day | Phase 1 | Driver interface implemented |
| Phase 3: Bridge Integration | 1 day | Phase 2 | End-to-end pipeline working |
| Phase 4: Documentation | 1 day | Phase 3 | Docs reviewed and approved |
| **Total** | **5-6 days** | **Hardware + developer** | **T-029 DONE** |

## Success Metrics

1. **Telemetry accuracy:** All fields match RoasTime values within ±1% (temperatures) or exact (settings)
2. **Latency:** <100ms from hardware reading to MQTT publish
3. **Reliability:** Zero crashes during 24-hour stress test
4. **Cross-platform:** Successful deployment on Linux, macOS, Windows
5. **Zero interference:** RoasTime and manual controls unaffected (when not running concurrently)

## Future Enhancements (Post-T-029)

### P1 (Nice-to-Have)

- **USB device sharing:** Allow concurrent RoasTime + shadow driver (requires kernel investigation)
- **Multiple devices:** Support multiple Bullet R1 units on same host
- **Hot-plug detection:** Auto-connect when device plugged in
- **Write operations:** Integrate with M4 command service for L3 autopilot

### P2 (Future)

- **Bullet R2 support:** Extend driver for R2 protocol (requires R2 hardware)
- **Firmware update support:** Safe OTA firmware updates via USB
- **Advanced telemetry:** Parse additional R2-specific fields (humidity, power metrics)
- **Cloud sync:** Roast data sync with Roast.World (if API available)

## References

- **T-029a Protocol Spec:** [docs/specs/bullet-r1-usb-protocol.md](../specs/bullet-r1-usb-protocol.md)
- **T-020 TCP-Line Driver:** `drivers/tcp-line/` (reference implementation for Rust N-API pattern)
- **Artisan R1 Driver:** [GitHub - artisan-roaster-scope/artisan](https://github.com/artisan-roaster-scope/artisan/blob/master/src/artisanlib/aillio_r1.py)
- **Driver Interface:** `drivers/core/src/types.ts`
- **Driver Bridge:** `services/driver-bridge/`

## Approval

- [ ] Protocol specification reviewed (T-029a)
- [ ] Architecture approved
- [ ] Hardware available for testing
- [ ] Risk assessment accepted
- [ ] Ready to implement

**Status:** PLANNED (awaiting hardware access)
