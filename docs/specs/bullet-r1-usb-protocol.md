# Aillio Bullet R1 V2 USB Protocol Specification

**Version:** 1.0 (Draft)
**Date:** 2026-01-07
**Status:** Research/Reconnaissance
**Source:** Reverse-engineered from [Artisan roasting software](https://github.com/artisan-roaster-scope/artisan)

## Overview

This document specifies the USB communication protocol for the Aillio Bullet R1 V2 coffee roaster. The protocol is **not officially documented** by Aillio and has been reverse-engineered from the open-source [Artisan roasting software](https://github.com/artisan-roaster-scope/artisan) implementation.

**WARNING:** This specification is based on third-party reverse engineering and may be incomplete or contain errors. Use at your own risk. Aillio does not provide official protocol documentation or developer support.

## 1. USB Device Identification

### Device IDs

| Parameter | Value | Notes |
|-----------|-------|-------|
| Vendor ID (VID) | `0x0483` | STMicroelectronics |
| Product ID (PID) - Standard | `0x5741` | Most R1 units |
| Product ID (PID) - Rev3 | `0xa27e` | Revision 3 hardware |
| Interface | `0x1` | USB interface number |
| Configuration | `0x1` | USB configuration |

### Driver Requirements

- **Windows:** libusb-win32 (v1.2.6.0) or WinUSB driver
- **Linux/macOS:** libusb-1.0 system library
  - `/usr/lib/x86_64-linux-gnu/libusb-1.0.so` (x86_64)
  - `/usr/lib/aarch64-linux-gnu/libusb-1.0.so` (ARM64)
- Kernel driver detachment required on Linux/macOS when claiming interface

## 2. USB Endpoints

| Endpoint | Direction | Type | Purpose |
|----------|-----------|------|---------|
| `0x3` | OUT (Write) | Bulk | Send commands to roaster |
| `0x81` | IN (Read) | Bulk | Receive status/data from roaster |

## 3. Command Structure

Commands are sent as byte arrays to endpoint `0x3`. All commands use the following general structure:

```
[command_byte, sub_command, parameter_high, parameter_low]
```

### Command Registry

| Command | Bytes | Description |
|---------|-------|-------------|
| `AILLIO_CMD_INFO1` | `[0x30, 0x02]` | Query device info (serial, firmware) |
| `AILLIO_CMD_INFO2` | `[0x30, 0x03]` | Query roast count |
| `AILLIO_CMD_STATUS1` | `[0x30, 0x01]` | Get first 64 bytes of status |
| `AILLIO_CMD_STATUS2` | `[0x30, 0x01]` | Get second 64 bytes of status |
| `AILLIO_CMD_PRS` | `[0x30, 0x01, 0x00, 0x00]` | PRS (Power/Roast/Stop) button |
| `AILLIO_CMD_HEATER_INCR` | `[0x34, 0x01, 0xaa, 0xaa]` | Increment heater setting |
| `AILLIO_CMD_HEATER_DECR` | `[0x34, 0x02, 0xaa, 0xaa]` | Decrement heater setting |
| `AILLIO_CMD_FAN_INCR` | `[0x31, 0x01, 0xaa, 0xaa]` | Increment fan setting |
| `AILLIO_CMD_FAN_DECR` | `[0x31, 0x02, 0xaa, 0xaa]` | Decrement fan setting |
| `AILLIO_CMD_DRUM_SPEED` | `[0x32, 0x01, speed, 0x00]` | Set drum speed (1-9) |

**Notes:**
- `0xaa, 0xaa` padding bytes appear to be placeholders
- Heater and fan use increment/decrement commands rather than absolute values
- Drum speed is set directly with a value from 1-9

## 4. Status Data Format

Status data is retrieved by sending two consecutive `AILLIO_CMD_STATUS1` commands, which return two 64-byte packets (128 bytes total).

### First 64-Byte Packet (Status Part 1)

| Offset | Type | Field | Range/Unit | Description |
|--------|------|-------|------------|-------------|
| 0-3 | float32 | Bean Temperature (BT) | °C or °F | Primary bean probe temperature |
| 4-7 | float32 | Bean Temperature RoR | °/min | Rate of rise for BT |
| 8-11 | float32 | Drum Temperature (DT) | °C or °F | Drum temperature |
| 16-19 | float32 | Exit Temperature | °C or °F | Air exit temperature |
| 24 | uint8 | Elapsed Minutes | 0-255 | Roast elapsed time (minutes) |
| 25 | uint8 | Elapsed Seconds | 0-59 | Roast elapsed time (seconds) |
| 26 | uint8 | Fan Setting | 1-12 | Current fan power level |
| 27 | uint8 | Heater Setting | 0-9 | Current heater power level |
| 28 | uint8 | Drum Speed | 1-9 | Current drum rotation speed |
| 29 | uint8 | Roaster State | See state table | Current roasting state |
| 32-35 | float32 | IR Temperature (IBTS) | °C or °F | Infrared bean temperature sensor |
| 36-39 | float32 | PCB Temperature | °C or °F | Control board temperature |
| 41 | uint8 | Validity Flag | 10 = valid | Data validity indicator |
| 44-45 | uint16 | Fan RPM | 0-65535 | Fan speed in RPM |
| 48-49 | uint16 | Voltage | mV | Input voltage |
| 52-55 | uint32 | Coil Fan Setting | 0-100 | Induction coil fan duty cycle (%) |

### Second 64-Byte Packet (Status Part 2)

| Offset (relative) | Type | Field | Range/Unit | Description |
|-------------------|------|-------|------------|-------------|
| 32-35 | uint32 | Secondary Coil Fan | 0-100 | Secondary coil fan duty (%) |
| 40-41 | uint16 | Preheat Target Temp | °C or °F | Target temperature for preheat |

**Data Types:**
- `float32`: IEEE 754 single-precision floating point (little-endian)
- `uint8`: 8-bit unsigned integer
- `uint16`: 16-bit unsigned integer (little-endian)
- `uint32`: 32-bit unsigned integer (little-endian)

## 5. Roaster State Machine

| State Code | State Name | Description |
|------------|------------|-------------|
| `0x00` | OFF | Roaster powered off or idle |
| `0x02` | Pre-heating | Heating to target temperature before charge |
| `0x04` | Charge | Ready to add beans |
| `0x06` | Roasting | Active roasting in progress |
| `0x08` | Cooling | Cooling cycle after drop |
| `0x09` | Shutdown | Shutdown sequence |

**State Transitions:**
```
OFF → Pre-heating → Charge → Roasting → Cooling → OFF
                     ↓
                  Shutdown (emergency)
```

## 6. Initialization Sequence

When opening a connection to the Bullet R1:

1. **Claim USB interface** (detach kernel driver on Linux/macOS)
2. **Send `AILLIO_CMD_INFO1`** (`[0x30, 0x02]`)
   - Read 32-byte response from endpoint `0x81`
   - Bytes 0-1: Serial number (uint16)
   - Bytes 24-25: Firmware version (uint16)
3. **Send `AILLIO_CMD_INFO2`** (`[0x30, 0x03]`)
   - Read 36-byte response from endpoint `0x81`
   - Bytes 27-30: Total roast count (uint32)
4. **Establish command pipe** for bidirectional communication

## 7. Polling and Timing

- **Status update frequency:** 100ms (10 Hz)
- **Command queueing:** Use bidirectional pipe for thread-safe command submission
- **Noise reduction:** Filter/throttle messages every 15 seconds when not actively roasting
- **Timeout:** USB read operations should timeout after 1000ms to detect disconnection

## 8. Control Commands

### Heater Control

- **Range:** 0-9 (10 levels)
- **Method:** Increment/decrement only (no absolute setting)
- **Commands:**
  - Increase: Send `AILLIO_CMD_HEATER_INCR` multiple times
  - Decrease: Send `AILLIO_CMD_HEATER_DECR` multiple times

### Fan Control

- **Range:** 1-12 (12 levels)
- **Method:** Increment/decrement only
- **Commands:**
  - Increase: Send `AILLIO_CMD_FAN_INCR` multiple times
  - Decrease: Send `AILLIO_CMD_FAN_DECR` multiple times

### Drum Speed Control

- **Range:** 1-9 (9 levels)
- **Method:** Direct absolute setting
- **Command:** `[0x32, 0x01, speed, 0x00]` where `speed` is 1-9

### PRS Button (Power/Roast/Stop)

- **Command:** `[0x30, 0x01, 0x00, 0x00]`
- **Function:** Context-dependent based on current state
  - OFF → Pre-heating: Start preheat
  - Pre-heating → Charge: Cancel preheat
  - Charge → Roasting: Start roast (charge beans)
  - Roasting → Cooling: End roast (drop beans)

## 9. Data Validation

- **Validity Flag:** Check byte 41 of first status packet
  - Value `10` (0x0A) indicates valid data
  - Other values indicate invalid/stale data
- **Range Checks:** Validate all numeric values are within expected ranges
- **State Machine:** Validate state transitions are legal

## 10. Platform-Specific Considerations

### Windows
- Requires libusb-win32 driver (v1.2.6.0) or WinUSB
- Install via Zadig tool: select libusb-win32 and click "Replace Driver"
- RoasTime 2.x uses WinUSB (incompatible with older libusb driver)

### Linux/macOS
- Use system libusb-1.0
- Detach kernel driver before claiming interface:
  ```python
  if dev.is_kernel_driver_active(INTERFACE):
      dev.detach_kernel_driver(INTERFACE)
  ```
- Require appropriate udev rules for device permissions on Linux

## 11. Known Limitations

1. **No Official Documentation:** This spec is reverse-engineered and may be incomplete
2. **No Absolute Heater/Fan Setting:** Must use increment/decrement commands
3. **No Write Acknowledgment:** Commands do not return success/failure responses
4. **State Persistence:** Device may reject commands in invalid states (no error feedback)
5. **Firmware Differences:** Protocol may vary across firmware versions
6. **RoasTime Compatibility:** Using third-party software may interfere with official RoasTime app

## 12. Safety Considerations

### Critical Safety Requirements

1. **Do NOT send rapid command sequences** - Allow device to process commands
2. **Monitor roaster state** - Respect state machine constraints
3. **Validate inputs** - Ensure heater/fan/drum values are within safe ranges
4. **Emergency stop** - Implement timeout/watchdog for connection loss
5. **Temperature limits** - Monitor all temperature sensors for safety thresholds

### Recommended Safeguards

- **Connection monitoring:** Detect USB disconnection and halt operations
- **State validation:** Verify state transitions before sending control commands
- **Rate limiting:** Limit command frequency to prevent device overload
- **Operator override:** Always allow manual intervention via hardware controls

## 13. Implementation Recommendations

### Driver Architecture

Based on analysis of Artisan R1 and R2 implementations:

1. **Thread Safety:**
   - Use multiprocessing pipes for command queueing
   - Implement cleanup locks for graceful shutdown
   - Separate read/write threads to prevent blocking

2. **Error Handling:**
   - Comprehensive exception handling with retry logic
   - Timeout detection for USB read/write operations
   - Graceful degradation on invalid data

3. **State Management:**
   - Maintain internal state machine
   - Validate transitions before sending commands
   - Log all state changes for debugging

4. **Data Processing:**
   - Parse binary data using struct unpacking (little-endian)
   - Validate all numeric values against expected ranges
   - Handle temperature unit conversion (°C ↔ °F)

5. **Platform Support:**
   - Detect libusb backend at runtime
   - Handle Windows/Linux/macOS driver differences
   - Graceful fallback if specific library versions unavailable

### Testing Strategy

1. **Hardware Required:**
   - Aillio Bullet R1 V2 unit for validation
   - USB sniffer/analyzer for protocol verification
   - Multiple firmware versions for compatibility testing

2. **Test Cases:**
   - Connection establishment and teardown
   - Status polling at various frequencies
   - All control commands (heater, fan, drum, PRS)
   - State machine transitions
   - Error conditions (disconnection, invalid commands)
   - Long-duration roasting sessions (thermal stability)

## 14. References

### Source Code

- **Artisan R1 Driver:** [aillio_r1.py](https://github.com/artisan-roaster-scope/artisan/blob/master/src/artisanlib/aillio_r1.py)
- **Artisan R2 Driver:** [aillio_r2.py](https://github.com/artisan-roaster-scope/artisan/blob/master/src/artisanlib/aillio_r2.py)
- **Artisan Project:** [GitHub - artisan-roaster-scope/artisan](https://github.com/artisan-roaster-scope/artisan)

### Community Resources

- **Artisan Documentation:** [Aillio | Leading coffee roasting software](https://artisan-scope.org/machines/aillio/)
- **Roast World Community:** [Bullet R1 Hacks](https://community.roast.world/c/bullet-r1-hacks/15)
- **GitHub Issues:** [Artisan issues tagged with Aillio](https://github.com/artisan-roaster-scope/artisan/issues?q=is%3Aissue+aillio)

### Official Resources

- **Aillio Docs:** [Bullet R1 V2 | Aillio Docs](https://docs.aillio.com/bullet-r1/)
- **Operation Manual:** [Aillio Bullet R1 Operation Manual (PDF)](https://www.topcoffee.net/media/coffee/Aillio-Bullet-R1-Manual_EN.pdf)
- **Support:** support@aillio.com (protocol documentation not publicly available)

## 15. Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-07 | 1.0 (Draft) | Initial specification from Artisan source analysis |

## 16. License and Disclaimer

**Disclaimer:** This document is provided for educational and research purposes. The protocol specification is reverse-engineered from open-source software and may be incomplete, inaccurate, or become outdated. Use at your own risk.

**Source License:** The Artisan roasting software is licensed under GPL-3.0. This specification document does not contain source code and is provided as-is for protocol documentation purposes.

**No Warranty:** The author and contributors provide no warranty regarding the accuracy or completeness of this specification. Improper use of this information could damage equipment or create safety hazards.
