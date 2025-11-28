import type { FastifyBaseLogger } from "fastify";
import {
  SessionClosedEventSchema,
  type SessionClosedEvent
} from "@sim-corp/schemas";
import type { KernelClientLike, MissionRequest, MissionResult } from "./kernel-client";
import { ErrorBuffer, type RecordedError } from "./dedupe";

export interface DispatcherCounters {
  eventsReceived: number;
  missionsCreated: number;
  missionsDeduped: number;
  parseErrors: number;
  validationErrors: number;
  kernelErrors: number;
}

export interface DispatcherStatus {
  counters: DispatcherCounters;
  lastErrors: RecordedError[];
  subscribedTopics: string[];
  goals: string[];
}

interface DispatcherDeps {
  kernel: KernelClientLike;
  logger?: FastifyBaseLogger;
  goals?: string[];
  subscribedTopics?: string[];
  maxAttempts?: number;
}

export class Dispatcher {
  private readonly counters: DispatcherCounters = {
    eventsReceived: 0,
    missionsCreated: 0,
    missionsDeduped: 0,
    parseErrors: 0,
    validationErrors: 0,
    kernelErrors: 0
  };
  private readonly errors = new ErrorBuffer(20);
  private readonly goals: string[];
  private readonly subscribedTopics: string[];
  private readonly maxAttempts: number;

  constructor(private readonly deps: DispatcherDeps) {
    this.goals = deps.goals ?? ["generate-roast-report"];
    this.subscribedTopics = deps.subscribedTopics ?? [];
    this.maxAttempts = deps.maxAttempts ?? 5;
  }

  async handleMessage(topic: string, payload: Buffer): Promise<void> {
    this.counters.eventsReceived += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload.toString("utf-8"));
    } catch (err) {
      this.counters.parseErrors += 1;
      this.errors.push("parse error", { err: (err as Error)?.message ?? String(err), topic });
      this.deps.logger?.warn({ err, topic }, "dispatcher: failed to parse MQTT payload");
      return;
    }

    const validated = SessionClosedEventSchema.safeParse(parsed);
    if (!validated.success) {
      this.counters.validationErrors += 1;
      this.errors.push("validation error", { topic, issues: validated.error.issues });
      this.deps.logger?.warn({ topic, issues: validated.error.issues }, "dispatcher: invalid session.closed payload");
      return;
    }

    await this.processEvent(validated.data);
  }

  async processEvent(event: SessionClosedEvent): Promise<void> {
    const missionRequest: MissionRequest = {
      goal: this.goals[0] ?? "generate-roast-report",
      params: { sessionId: event.sessionId, reportKind: event.reportKind },
      idempotencyKey: this.buildIdempotencyKey(event),
      maxAttempts: this.maxAttempts
    };

    try {
      const result = await this.deps.kernel.createMission(missionRequest);
      this.trackMissionResult(result);
    } catch (err) {
      this.counters.kernelErrors += 1;
      this.errors.push("kernel error", {
        err: (err as Error)?.message ?? String(err),
        idempotencyKey: missionRequest.idempotencyKey
      });
      this.deps.logger?.error({ err, idempotencyKey: missionRequest.idempotencyKey }, "dispatcher: kernel error");
    }
  }

  getStatus(): DispatcherStatus {
    return {
      counters: { ...this.counters },
      lastErrors: this.errors.list(),
      subscribedTopics: [...this.subscribedTopics],
      goals: [...this.goals]
    };
  }

  private trackMissionResult(result: MissionResult): void {
    if (result === "deduped") {
      this.counters.missionsDeduped += 1;
    } else {
      this.counters.missionsCreated += 1;
    }
  }

  private buildIdempotencyKey(event: SessionClosedEvent): string {
    return `generate-roast-report:${event.reportKind}:${event.sessionId}`;
  }
}
