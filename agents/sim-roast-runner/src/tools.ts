import { z } from "zod";
import type { ToolRegistry } from "@sim-corp/agent-runtime";
import { RoastEventSchema, TelemetryPointSchema } from "@sim-corp/schemas";
import { SimRoastRequestSchema } from "@sim-corp/sim-twin";

const SIM_TWIN_DEFAULT_URL = "http://127.0.0.1:4002";

const SimulateRoastOutputSchema = z.object({
  telemetry: z.array(TelemetryPointSchema),
  events: z.array(RoastEventSchema)
});

type SimulateRoastOutput = z.infer<typeof SimulateRoastOutputSchema>;

async function callSimTwin(input: unknown): Promise<SimulateRoastOutput> {
  const parsedInput = SimRoastRequestSchema.parse(input);
  const baseUrl = process.env.SIM_TWIN_URL ?? SIM_TWIN_DEFAULT_URL;
  const endpoint = new URL("/simulate/roast", baseUrl);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(parsedInput)
  });

  if (!response.ok) {
    throw new Error(`SimTwin error: ${response.status}`);
  }

  const json = await response.json();
  return SimulateRoastOutputSchema.parse(json);
}

export const SIMULATE_ROAST_TOOL_NAME = "simulateRoast" as const;

export function createSimRoastTools(): ToolRegistry {
  return {
    [SIMULATE_ROAST_TOOL_NAME]: async (input: unknown) => callSimTwin(input)
  };
}
