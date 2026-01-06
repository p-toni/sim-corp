import type {
  RoasterCommand,
  CommandConstraints,
} from "@sim-corp/schemas";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SafetyGates {
  validateConstraints(command: RoasterCommand): ValidationResult;
  validateStateGuards(
    command: RoasterCommand,
    currentState: Record<string, any>
  ): ValidationResult;
  validateRateLimits(
    command: RoasterCommand,
    recentCommands: RoasterCommand[]
  ): ValidationResult;
}

export function createSafetyGates(): SafetyGates {
  return {
    validateConstraints(command: RoasterCommand): ValidationResult {
      const errors: string[] = [];
      const constraints = command.constraints;

      // Validate value ranges
      if (
        command.targetValue !== undefined &&
        command.targetValue !== null
      ) {
        if (
          constraints.minValue !== undefined &&
          command.targetValue < constraints.minValue
        ) {
          errors.push(
            `Target value ${command.targetValue} is below minimum ${constraints.minValue}`
          );
        }
        if (
          constraints.maxValue !== undefined &&
          command.targetValue > constraints.maxValue
        ) {
          errors.push(
            `Target value ${command.targetValue} exceeds maximum ${constraints.maxValue}`
          );
        }
      }

      // Validate command-specific constraints
      switch (command.commandType) {
        case "SET_POWER":
          if (
            command.targetValue !== undefined &&
            (command.targetValue < 0 || command.targetValue > 100)
          ) {
            errors.push("Power must be between 0-100%");
          }
          break;
        case "SET_FAN":
          if (
            command.targetValue !== undefined &&
            (command.targetValue < 1 || command.targetValue > 10)
          ) {
            errors.push("Fan level must be between 1-10");
          }
          break;
        case "SET_DRUM":
          if (
            command.targetValue !== undefined &&
            (command.targetValue < 0 || command.targetValue > 100)
          ) {
            errors.push("Drum RPM must be between 0-100");
          }
          break;
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    },

    validateStateGuards(
      command: RoasterCommand,
      currentState: Record<string, any>
    ): ValidationResult {
      const errors: string[] = [];
      const constraints = command.constraints;

      // Check required states
      if (constraints.requireStates && constraints.requireStates.length > 0) {
        for (const requiredState of constraints.requireStates) {
          if (!currentState[requiredState]) {
            errors.push(`Required state not met: ${requiredState}`);
          }
        }
      }

      // Check forbidden states
      if (
        constraints.forbiddenStates &&
        constraints.forbiddenStates.length > 0
      ) {
        for (const forbiddenState of constraints.forbiddenStates) {
          if (currentState[forbiddenState]) {
            errors.push(`Forbidden state detected: ${forbiddenState}`);
          }
        }
      }

      // Command-specific state validation
      switch (command.commandType) {
        case "CHARGE":
          if (!currentState.drumRotating) {
            errors.push("Cannot charge beans: drum must be rotating");
          }
          break;
        case "DROP":
          if (!currentState.roastInProgress) {
            errors.push("Cannot drop: no roast in progress");
          }
          break;
        case "PREHEAT":
          if (currentState.roastInProgress) {
            errors.push("Cannot preheat: roast already in progress");
          }
          break;
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    },

    validateRateLimits(
      command: RoasterCommand,
      recentCommands: RoasterCommand[]
    ): ValidationResult {
      const errors: string[] = [];
      const constraints = command.constraints;

      // Check minimum interval between commands
      if (constraints.minIntervalSeconds !== undefined) {
        const sameTypeCommands = recentCommands.filter(
          (c) =>
            c.commandType === command.commandType &&
            c.machineId === command.machineId
        );

        if (sameTypeCommands.length > 0) {
          const lastCommand = sameTypeCommands[0];
          const lastTimestamp = new Date(lastCommand.timestamp).getTime();
          const currentTimestamp = new Date(command.timestamp).getTime();
          const elapsedSeconds = (currentTimestamp - lastTimestamp) / 1000;

          if (elapsedSeconds < constraints.minIntervalSeconds) {
            errors.push(
              `Command rate limit exceeded: minimum ${constraints.minIntervalSeconds}s between ${command.commandType} commands (${elapsedSeconds.toFixed(1)}s elapsed)`
            );
          }
        }
      }

      // Check daily count limit
      if (constraints.maxDailyCount !== undefined) {
        const now = new Date(command.timestamp);
        const startOfDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );

        const todayCommands = recentCommands.filter((c) => {
          const cmdTime = new Date(c.timestamp);
          return (
            c.commandType === command.commandType &&
            c.machineId === command.machineId &&
            cmdTime >= startOfDay
          );
        });

        if (todayCommands.length >= constraints.maxDailyCount) {
          errors.push(
            `Daily limit exceeded: maximum ${constraints.maxDailyCount} ${command.commandType} commands per day (${todayCommands.length} already executed)`
          );
        }
      }

      // Check ramp rate (for power/fan/drum changes)
      if (
        constraints.rampRate !== undefined &&
        command.targetValue !== undefined
      ) {
        const sameTypeCommands = recentCommands.filter(
          (c) =>
            c.commandType === command.commandType &&
            c.machineId === command.machineId &&
            c.targetValue !== undefined
        );

        if (sameTypeCommands.length > 0) {
          const lastCommand = sameTypeCommands[0];
          const lastValue = lastCommand.targetValue!;
          const currentValue = command.targetValue;
          const valueDelta = Math.abs(currentValue - lastValue);

          const lastTimestamp = new Date(lastCommand.timestamp).getTime();
          const currentTimestamp = new Date(command.timestamp).getTime();
          const elapsedSeconds = (currentTimestamp - lastTimestamp) / 1000;

          const actualRate = valueDelta / elapsedSeconds;

          if (actualRate > constraints.rampRate) {
            errors.push(
              `Ramp rate exceeded: maximum ${constraints.rampRate} units/second (attempted ${actualRate.toFixed(2)} units/second)`
            );
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    },
  };
}
