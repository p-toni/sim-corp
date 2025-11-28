import mqtt, { type MqttClient as RawMqttClient } from "mqtt";
import type { SessionClosedEvent } from "@sim-corp/schemas";

export interface OpsEventPublisher {
  publishSessionClosed(event: SessionClosedEvent): Promise<void>;
  disconnect(): Promise<void>;
}

export class MqttOpsEventPublisher implements OpsEventPublisher {
  private readonly client: RawMqttClient;

  constructor(brokerUrl: string, clientId?: string) {
    this.client = mqtt.connect(brokerUrl, { clientId });
  }

  async publishSessionClosed(event: SessionClosedEvent): Promise<void> {
    const topic = buildSessionClosedTopic(event);
    const payload = JSON.stringify(event);
    await new Promise<void>((resolve, reject) => {
      this.client.publish(topic, payload, { qos: 0 }, (err?: Error) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.client.end(false, {}, (err?: Error) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}

export function buildSessionClosedTopic(event: SessionClosedEvent): string {
  return `ops/${event.orgId}/${event.siteId}/${event.machineId}/session/closed`;
}
