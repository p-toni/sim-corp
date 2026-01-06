# Command Service Operations Guide

**Last Updated**: 2026-01-06
**Status**: Production-Ready (M4)
**Service**: `@sim-corp/command`

## Overview

The Command Service provides L3 autonomy (act with explicit approval) for coffee roaster hardware control. It implements a complete command lifecycle from proposal through approval, execution, and audit.

### Key Features

- **HITL (Human-In-The-Loop)**: Explicit approval gates for all hardware-actuation commands
- **Safety Gates**: Multi-layer validation (constraints, state guards, rate limits)
- **Complete Audit Trail**: Immutable logging from proposal → outcome
- **Zero Uncontrolled Actuation**: No commands execute without approval path
- **Driver Abstraction**: Works with any driver implementing write interface

## Architecture

```
┌─────────────┐
│ Agent/User  │
└──────┬──────┘
       │ 1. Propose Command
       v
┌──────────────────┐
│ Command Service  │──→ Safety Gates (constraints, state, rate limits)
└──────┬───────────┘
       │ 2. PENDING_APPROVAL
       v
┌──────────────────┐
│ Approval UI/API  │──→ Human reviews reasoning + safety checks
└──────┬───────────┘
       │ 3. APPROVED
       v
┌──────────────────┐
│ Command Executor │──→ Driver.writeCommand()
└──────┬───────────┘
       │ 4. COMPLETED
       v
┌──────────────────┐
│ Audit Log        │──→ Immutable record of all actions
└──────────────────┘
```

### Components

1. **Command Service** (`src/core/command-service.ts`)
   - Proposal submission and validation
   - Approval/rejection workflow
   - Safety gate enforcement

2. **Command Executor** (`src/core/executor.ts`)
   - Coordinates approved command execution
   - Driver interaction
   - Outcome logging

3. **Safety Gates** (`src/core/validators.ts`)
   - Constraint validation (min/max, ramp rates)
   - State guards (required/forbidden states)
   - Rate limits (interval, daily count)

4. **Repository** (`src/db/repo.ts`)
   - SQLite storage with full lifecycle tracking
   - Audit log management

5. **REST API** (`src/routes/`)
   - Proposal endpoints
   - Approval/rejection endpoints
   - Execution endpoints

## Command Types

| Command Type | Description | Target Value | Unit |
|--------------|-------------|--------------|------|
| `SET_POWER` | Set heater power | 0-100 | % |
| `SET_FAN` | Set fan speed | 1-10 | level |
| `SET_DRUM` | Set drum RPM | 0-100 | RPM |
| `ABORT` | Emergency abort | - | - |
| `PREHEAT` | Initiate preheat | Temperature | °C |
| `CHARGE` | Charge beans | - | - |
| `DROP` | Drop/eject beans | - | - |

## Command Lifecycle

### States

1. **PROPOSED** - Initial state, command created
2. **PENDING_APPROVAL** - Awaiting operator approval
3. **APPROVED** - Approved by operator, ready to execute
4. **REJECTED** - Rejected by operator or validator
5. **EXECUTING** - Currently being executed
6. **COMPLETED** - Successfully completed
7. **FAILED** - Failed during execution
8. **ABORTED** - Aborted by operator or system
9. **TIMEOUT** - Approval timeout expired

### State Transitions

```
PROPOSED
  ├─→ PENDING_APPROVAL (if approvalRequired=true)
  │   ├─→ APPROVED (operator approval)
  │   │   └─→ EXECUTING
  │   │       ├─→ COMPLETED (success)
  │   │       ├─→ FAILED (error)
  │   │       └─→ ABORTED (abort)
  │   ├─→ REJECTED (operator rejection)
  │   └─→ TIMEOUT (approval expires)
  └─→ APPROVED (if approvalRequired=false, e.g. ABORT)
      └─→ EXECUTING → COMPLETED/FAILED/ABORTED
```

## Deployment

### Environment Variables

```bash
# Required
COMMAND_DB_PATH=./var/command.db          # SQLite database path
COMMAND_PORT=3004                          # HTTP server port
COMMAND_HOST=0.0.0.0                       # Bind address

# Optional
LOG_LEVEL=info                             # Logging level
```

### Starting the Service

```bash
cd services/command
pnpm install
pnpm start
```

### Docker Deployment

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN pnpm install --prod
CMD ["pnpm", "start"]
```

```bash
docker build -t simcorp/command:latest .
docker run -p 3004:3004 \
  -v ./var:/app/var \
  -e COMMAND_DB_PATH=/app/var/command.db \
  simcorp/command:latest
```

## API Reference

### Base URL

```
http://localhost:3004
```

### Endpoints

#### POST /proposals

Propose a new command.

**Request Body**:
```json
{
  "command": {
    "commandId": "cmd-123",
    "commandType": "SET_POWER",
    "machineId": "machine-1",
    "targetValue": 75,
    "targetUnit": "%",
    "timestamp": "2026-01-06T12:00:00.000Z",
    "constraints": {
      "minValue": 0,
      "maxValue": 100,
      "rampRate": 10
    }
  },
  "proposedBy": "AGENT",
  "agentName": "roast-agent",
  "agentVersion": "1.0.0",
  "reasoning": "Need to increase power for development phase",
  "sessionId": "session-123",
  "approvalRequired": true
}
```

**Response**: CommandProposal object

#### GET /proposals/pending

Get all commands pending approval.

**Response**: Array of CommandProposal objects

#### GET /proposals/:proposalId

Get a specific proposal.

**Response**: CommandProposal object or 404

#### GET /proposals/machine/:machineId

Get all proposals for a machine.

**Response**: Array of CommandProposal objects

#### GET /proposals/session/:sessionId

Get all proposals for a session.

**Response**: Array of CommandProposal objects

#### POST /proposals/:proposalId/approve

Approve a pending proposal.

**Request Body**:
```json
{
  "approvedBy": {
    "kind": "USER",
    "id": "user-123",
    "display": "Jane Operator"
  }
}
```

**Response**: Updated CommandProposal object

#### POST /proposals/:proposalId/reject

Reject a pending proposal.

**Request Body**:
```json
{
  "rejectedBy": {
    "kind": "USER",
    "id": "user-123",
    "display": "Jane Operator"
  },
  "reason": "Not ready for this power level"
}
```

**Response**: Updated CommandProposal object

#### POST /execute/:proposalId

Execute an approved command.

**Response**: CommandExecutionResult object

#### POST /abort/:proposalId

Abort an executing command.

**Response**: CommandExecutionResult object

#### GET /status/:proposalId

Get execution status of a proposal.

**Response**: CommandProposal object with execution metadata

#### GET /health

Health check endpoint.

**Response**: `{"status": "ok", "service": "command"}`

## Safety Gates

### 1. Constraint Validation

Validates command parameters against defined constraints.

**Checks**:
- `minValue` / `maxValue`: Range validation
- Command-specific ranges:
  - SET_POWER: 0-100%
  - SET_FAN: 1-10 levels
  - SET_DRUM: 0-100 RPM

**Example**:
```javascript
{
  "constraints": {
    "minValue": 0,
    "maxValue": 85,  // Max power for this machine
  }
}
// Command with targetValue=150 → REJECTED
```

### 2. State Guards

Validates roaster state requirements.

**Checks**:
- `requireStates`: Required conditions (e.g., "drumRotating")
- `forbiddenStates`: Forbidden conditions (e.g., "emergencyStop")
- Command-specific rules:
  - CHARGE: Requires drum rotating
  - DROP: Requires roast in progress
  - PREHEAT: Forbidden if roast in progress

**Example**:
```javascript
{
  "constraints": {
    "requireStates": ["drumRotating", "temperatureStable"],
    "forbiddenStates": ["emergencyStop"]
  }
}
```

### 3. Rate Limits

Prevents excessive command frequency.

**Checks**:
- `minIntervalSeconds`: Minimum time between same command type
- `maxDailyCount`: Maximum executions per day
- `rampRate`: Maximum value change per second

**Example**:
```javascript
{
  "constraints": {
    "minIntervalSeconds": 5,    // Min 5s between SET_POWER
    "maxDailyCount": 100,        // Max 100 SET_POWER per day
    "rampRate": 10               // Max 10 units/second change
  }
}
```

## Audit Trail

Every command proposal includes a complete audit log.

### Audit Entry Structure

```typescript
{
  "timestamp": "2026-01-06T12:00:00.000Z",
  "event": "PROPOSED" | "APPROVED" | "REJECTED" | "EXECUTION_STARTED" | "EXECUTION_COMPLETED" | "EXECUTION_FAILED" | "ABORTED",
  "actor": {
    "kind": "USER" | "AGENT" | "DEVICE" | "SYSTEM",
    "id": "actor-id",
    "display": "Display Name"
  },
  "details": {
    // Event-specific metadata
  }
}
```

### Example Audit Log

```json
[
  {
    "timestamp": "2026-01-06T12:00:00.000Z",
    "event": "PROPOSED",
    "actor": {"kind": "AGENT", "id": "roast-agent", "display": "Roast Agent"},
    "details": {"reasoning": "Need to increase power"}
  },
  {
    "timestamp": "2026-01-06T12:01:00.000Z",
    "event": "APPROVED",
    "actor": {"kind": "USER", "id": "user-123", "display": "Jane Operator"},
    "details": {}
  },
  {
    "timestamp": "2026-01-06T12:01:05.000Z",
    "event": "EXECUTION_STARTED",
    "actor": {"kind": "SYSTEM", "id": "command-executor", "display": "Command Executor"},
    "details": {}
  },
  {
    "timestamp": "2026-01-06T12:01:06.000Z",
    "event": "EXECUTION_COMPLETED",
    "actor": {"kind": "SYSTEM", "id": "command-executor", "display": "Command Executor"},
    "details": {"result": {"status": "ACCEPTED", "actualValue": 75}}
  }
]
```

## Driver Integration

### Driver Write Interface

Drivers must implement these optional methods to support commands:

```typescript
interface Driver {
  // Write operations (M4 - L3 Autopilot)
  writeCommand?(command: RoasterCommand): Promise<CommandExecutionResult>;
  abortCommand?(commandId?: string): Promise<CommandExecutionResult>;
  getCommandStatus?(commandId: string): Promise<CommandStatus | undefined>;
}
```

### Example Driver Implementation

```typescript
class MyDriver implements Driver {
  async writeCommand(command: RoasterCommand): Promise<CommandExecutionResult> {
    // Validate driver is connected
    if (!this.connected) {
      return {
        commandId: command.commandId,
        status: "FAILED",
        message: "Driver not connected",
        executedAt: new Date().toISOString(),
        errorCode: "NOT_CONNECTED"
      };
    }

    // Execute command based on type
    switch (command.commandType) {
      case "SET_POWER":
        await this.hardware.setPower(command.targetValue);
        break;
      case "SET_FAN":
        await this.hardware.setFan(command.targetValue);
        break;
      // ... other commands
    }

    return {
      commandId: command.commandId,
      status: "ACCEPTED",
      message: "Command executed successfully",
      executedAt: new Date().toISOString(),
      actualValue: command.targetValue
    };
  }

  async abortCommand(commandId?: string): Promise<CommandExecutionResult> {
    // Return to safe state
    await this.hardware.setPower(0);
    await this.hardware.setFan(1);

    return {
      commandId: commandId || `abort-${Date.now()}`,
      status: "ACCEPTED",
      message: "Aborted - returned to safe state",
      executedAt: new Date().toISOString()
    };
  }
}
```

### Registering Drivers

```typescript
import { registerDriver } from "@sim-corp/command";

const driver = new MyDriver({...});
await driver.connect();

registerDriver("machine-123", driver);
```

## Database Schema

### command_proposals Table

```sql
CREATE TABLE command_proposals (
  proposal_id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  site_id TEXT,
  org_id TEXT,
  target_value REAL,
  target_unit TEXT,
  constraints TEXT,        -- JSON
  metadata TEXT,           -- JSON

  proposed_by TEXT NOT NULL,  -- AGENT or HUMAN
  proposed_by_actor TEXT,     -- JSON Actor
  agent_name TEXT,
  agent_version TEXT,
  reasoning TEXT NOT NULL,
  session_id TEXT,
  mission_id TEXT,

  status TEXT NOT NULL DEFAULT 'PROPOSED',
  created_at TEXT NOT NULL,

  approval_required INTEGER NOT NULL DEFAULT 1,
  approval_timeout_seconds INTEGER NOT NULL DEFAULT 300,
  approved_by TEXT,           -- JSON Actor
  approved_at TEXT,
  rejected_by TEXT,           -- JSON Actor
  rejected_at TEXT,
  rejection_reason TEXT,      -- JSON CommandRejectionReason

  execution_started_at TEXT,
  execution_completed_at TEXT,
  execution_duration_ms INTEGER,

  outcome TEXT,               -- JSON
  audit_log TEXT NOT NULL DEFAULT '[]'  -- JSON array
);

CREATE INDEX idx_proposals_status ON command_proposals(status);
CREATE INDEX idx_proposals_machine ON command_proposals(machine_id);
CREATE INDEX idx_proposals_session ON command_proposals(session_id);
CREATE INDEX idx_proposals_created ON command_proposals(created_at);
```

## Monitoring

### Key Metrics

1. **Proposal Rate**: Commands proposed per minute/hour
2. **Approval Rate**: % of proposals approved vs rejected
3. **Execution Success Rate**: % of executions completed vs failed
4. **Approval Latency**: Time from PENDING_APPROVAL → APPROVED
5. **Execution Latency**: Time from APPROVED → COMPLETED

### Health Checks

```bash
# Service health
curl http://localhost:3004/health

# Pending approvals count
curl http://localhost:3004/proposals/pending | jq length

# Recent proposals for a machine
curl http://localhost:3004/proposals/machine/machine-123
```

### Logging

Command service logs all important events:

```
INFO  Command proposed: cmd-123 (SET_POWER 75%) by roast-agent
INFO  Command approved: cmd-123 by user-456
INFO  Command executing: cmd-123
INFO  Command completed: cmd-123 (duration: 1023ms)
ERROR Command failed: cmd-123 (error: Driver timeout)
```

## Troubleshooting

### Issue: Commands stuck in PENDING_APPROVAL

**Symptoms**: Proposals remain in PENDING_APPROVAL state indefinitely

**Causes**:
- No approval UI available
- Approval timeout not configured
- Operator not monitoring pending queue

**Resolution**:
```bash
# Check pending approvals
curl http://localhost:3004/proposals/pending

# Manually approve via API
curl -X POST http://localhost:3004/proposals/PROPOSAL_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approvedBy": {"kind": "USER", "id": "admin", "display": "Admin"}}'
```

### Issue: Commands rejected by safety gates

**Symptoms**: Proposals immediately rejected with "Constraint validation failed"

**Causes**:
- Invalid target values (out of range)
- Ramp rate too high
- Rate limits exceeded

**Resolution**:
1. Check rejection reason in proposal:
   ```bash
   curl http://localhost:3004/proposals/PROPOSAL_ID | jq .rejectionReason
   ```
2. Review constraints in command
3. Adjust command parameters to meet constraints

### Issue: Driver not found during execution

**Symptoms**: Execution fails with "No driver registered for machine"

**Causes**:
- Driver not registered with command service
- Driver crashed/disconnected

**Resolution**:
```typescript
// Ensure driver is registered
import { registerDriver } from "@sim-corp/command";

const driver = await initializeDriver(machineId);
registerDriver(machineId, driver);
```

### Issue: Execution timeout

**Symptoms**: Commands stuck in EXECUTING state

**Causes**:
- Driver hangs
- Hardware not responding
- Network issues

**Resolution**:
1. Abort the command:
   ```bash
   curl -X POST http://localhost:3004/abort/PROPOSAL_ID
   ```
2. Check driver health
3. Restart driver if necessary

## Security Considerations

### Access Control

- All approval endpoints should require authentication
- Implement role-based access (operators, administrators)
- Log all approval/rejection actions with authenticated user

### Audit Integrity

- Audit logs are append-only (no deletion/modification)
- Store audit log separately from operational data
- Regular audit log backups

### Command Validation

- Always validate commands at multiple layers
- Never trust client-provided constraints
- Enforce hardware-specific limits server-side

## Testing

### Unit Tests

```bash
cd services/command
pnpm test
```

Tests cover:
- Command proposal and validation
- Approval/rejection workflow
- Safety gate enforcement
- Audit log tracking
- Database operations

### Integration Testing

```bash
# Test command flow
curl -X POST http://localhost:3004/proposals \
  -H "Content-Type: application/json" \
  -d @test-command.json

# Get proposal ID from response, then approve
curl -X POST http://localhost:3004/proposals/PROPOSAL_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approvedBy": {"kind": "USER", "id": "test", "display": "Test User"}}'

# Execute
curl -X POST http://localhost:3004/execute/PROPOSAL_ID

# Check status
curl http://localhost:3004/status/PROPOSAL_ID
```

## Future Enhancements

- [ ] Approval timeout auto-rejection
- [ ] Batch command execution
- [ ] Command templates/presets
- [ ] Advanced safety gates (ML-based anomaly detection)
- [ ] Desktop approval UI (T-030.5)
- [ ] WebSocket push notifications for pending approvals
- [ ] Multi-operator approval (require N approvals)
- [ ] Command scheduling (execute at specific time)
- [ ] Rollback/undo capability

## References

- **Command Schemas**: `libs/schemas/src/kernel/command.ts`
- **Driver Interface**: `drivers/core/src/types.ts`
- **API Routes**: `services/command/src/routes/`
- **Task Registry**: T-030 (Safe Autopilot L3 Beta)
