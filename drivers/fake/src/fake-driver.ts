import type { TelemetryPoint, RoasterCommand, CommandExecutionResult } from "@sim-corp/schemas";
import type { Driver, DriverConfig, CommandStatus } from "@sim-corp/driver-core";

interface FakeDriverConfig extends DriverConfig {
  connection: DriverConfig["connection"] & {
    sampleIntervalSeconds?: number;
    seed?: number;
  };
}

type Rng = () => number;

function createRng(seed: number | undefined): Rng {
  let state = (seed ?? Date.now()) >>> 0;
  if (state === 0) state = 0x1abcdef;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class FakeDriver implements Driver {
  private elapsedSeconds = 0;
  private rng: Rng;
  private readonly sampleIntervalSeconds: number;
  private connected = false;

  // Command state (M4 - L3 Autopilot)
  private currentPowerLevel = 0; // 0-100%
  private currentFanLevel = 1; // 1-10
  private currentDrumRpm = 0; // 0-100 RPM
  private commandHistory: Map<string, CommandStatus> = new Map();
  private activeCommands: Set<string> = new Set();

  constructor(private readonly cfg: FakeDriverConfig) {
    this.sampleIntervalSeconds =
      typeof cfg.connection.sampleIntervalSeconds === "number"
        ? cfg.connection.sampleIntervalSeconds
        : 2;
    this.rng = createRng(
      typeof cfg.connection.seed === "number" ? cfg.connection.seed : undefined
    );
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.elapsedSeconds = 0;
  }

  async readTelemetry(): Promise<TelemetryPoint> {
    if (!this.connected) {
      throw new Error("Driver not connected");
    }

    const progress = this.elapsedSeconds / 700;
    const btBase = 180 + 60 * Math.atan(progress * 5);
    const noise = (this.rng() - 0.5) * 2;
    const btC = clamp(btBase + noise * 5, 160, 230);
    const etC = clamp(btC + 5 + this.rng() * 3, 160, 240);
    const rorCPerMin = clamp((btC - 160) / Math.max(1, this.elapsedSeconds + 1) * 60, 0, 25);

    const point: TelemetryPoint = {
      ts: new Date(Date.now()).toISOString(),
      machineId: this.cfg.machineId,
      elapsedSeconds: Number(this.elapsedSeconds.toFixed(2)),
      btC: Number(btC.toFixed(2)),
      etC: Number(etC.toFixed(2)),
      rorCPerMin: Number(rorCPerMin.toFixed(2)),
      extras: {}
    };

    this.elapsedSeconds += this.sampleIntervalSeconds;
    return point;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  /**
   * Write command to simulated roaster.
   *
   * Simulates command execution with basic validation and state updates.
   */
  async writeCommand(command: RoasterCommand): Promise<CommandExecutionResult> {
    if (!this.connected) {
      return {
        commandId: command.commandId,
        status: "FAILED",
        message: "Driver not connected",
        executedAt: new Date().toISOString(),
        errorCode: "NOT_CONNECTED"
      };
    }

    // Validate command type
    if (!this.isCommandSupported(command.commandType)) {
      return {
        commandId: command.commandId,
        status: "REJECTED",
        message: `Command type ${command.commandType} not supported by FakeDriver`,
        executedAt: new Date().toISOString(),
        errorCode: "UNSUPPORTED_COMMAND"
      };
    }

    // Simulate command execution
    try {
      const result = await this.executeCommand(command);

      // Track command in history
      this.commandHistory.set(command.commandId, {
        commandId: command.commandId,
        status: "COMPLETED",
        message: "Command executed successfully",
        progress: 100
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      this.commandHistory.set(command.commandId, {
        commandId: command.commandId,
        status: "FAILED",
        message: errorMessage
      });

      return {
        commandId: command.commandId,
        status: "FAILED",
        message: errorMessage,
        executedAt: new Date().toISOString(),
        errorCode: "EXECUTION_FAILED"
      };
    }
  }

  /**
   * Abort command or return to safe state.
   */
  async abortCommand(commandId?: string): Promise<CommandExecutionResult> {
    const abortId = commandId ?? `abort-${Date.now()}`;

    if (commandId && this.activeCommands.has(commandId)) {
      // Abort specific command
      this.activeCommands.delete(commandId);

      this.commandHistory.set(commandId, {
        commandId,
        status: "ABORTED",
        message: "Command aborted by operator"
      });
    } else if (!commandId) {
      // Abort all commands - return to safe state
      this.activeCommands.clear();
      this.currentPowerLevel = 0;
      this.currentFanLevel = 1;
      this.currentDrumRpm = 0;
    }

    return {
      commandId: abortId,
      status: "ACCEPTED",
      message: commandId ? `Aborted command ${commandId}` : "Returned to safe state",
      executedAt: new Date().toISOString()
    };
  }

  /**
   * Get status of a command.
   */
  async getCommandStatus(commandId: string): Promise<CommandStatus | undefined> {
    return this.commandHistory.get(commandId);
  }

  /**
   * Check if command type is supported by this driver.
   */
  private isCommandSupported(commandType: string): boolean {
    const supported = ["SET_POWER", "SET_FAN", "SET_DRUM", "ABORT", "PREHEAT"];
    return supported.includes(commandType);
  }

  /**
   * Execute a command and update driver state.
   */
  private async executeCommand(command: RoasterCommand): Promise<CommandExecutionResult> {
    const executedAt = new Date().toISOString();

    // Mark as executing
    this.activeCommands.add(command.commandId);
    this.commandHistory.set(command.commandId, {
      commandId: command.commandId,
      status: "EXECUTING",
      message: "Executing command",
      progress: 50
    });

    // Simulate execution delay (10-50ms)
    await new Promise((resolve) => setTimeout(resolve, 10 + Math.floor(this.rng() * 40)));

    // Execute command based on type
    let actualValue: number | undefined;

    switch (command.commandType) {
      case "SET_POWER":
        if (command.targetValue !== undefined) {
          const constrained = clamp(command.targetValue, 0, 100);
          this.currentPowerLevel = constrained;
          actualValue = constrained;
        }
        break;

      case "SET_FAN":
        if (command.targetValue !== undefined) {
          const constrained = clamp(command.targetValue, 1, 10);
          this.currentFanLevel = constrained;
          actualValue = constrained;
        }
        break;

      case "SET_DRUM":
        if (command.targetValue !== undefined) {
          const constrained = clamp(command.targetValue, 0, 100);
          this.currentDrumRpm = constrained;
          actualValue = constrained;
        }
        break;

      case "ABORT":
        this.currentPowerLevel = 0;
        this.currentFanLevel = 1;
        this.currentDrumRpm = 0;
        break;

      case "PREHEAT":
        // Simulate preheat - set power to 100%
        this.currentPowerLevel = 100;
        actualValue = 100;
        break;

      default:
        throw new Error(`Unsupported command type: ${command.commandType}`);
    }

    // Remove from active commands
    this.activeCommands.delete(command.commandId);

    return {
      commandId: command.commandId,
      status: "ACCEPTED",
      message: `${command.commandType} executed successfully`,
      executedAt,
      actualValue,
      metadata: {
        currentPowerLevel: this.currentPowerLevel,
        currentFanLevel: this.currentFanLevel,
        currentDrumRpm: this.currentDrumRpm
      }
    };
  }
}
