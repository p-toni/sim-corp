import type { SimRoastRequest } from "@sim-corp/sim-twin";
import type { SimTwinClient, SimOutput } from "./types";

const DEFAULT_SIM_TWIN_URL = "http://127.0.0.1:4002";

export class HttpSimTwinClient implements SimTwinClient {
  constructor(private readonly baseUrl: string = process.env.SIM_TWIN_URL ?? DEFAULT_SIM_TWIN_URL) {}

  async runSimulation(request: SimRoastRequest): Promise<SimOutput> {
    const endpoint = new URL("/simulate/roast", this.baseUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`sim-twin error: ${response.status}`);
    }

    const json = await response.json();
    return json as SimOutput;
  }
}
