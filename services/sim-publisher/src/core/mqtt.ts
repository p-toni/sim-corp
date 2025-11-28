import mqtt, { type MqttClient as RawMqttClient } from "mqtt";
import type { MqttPublisher } from "./types";

const DEFAULT_MQTT_URL = "mqtt://127.0.0.1:1883";

export class RealMqttPublisher implements MqttPublisher {
  private readonly client: RawMqttClient;

  constructor(brokerUrl: string = process.env.MQTT_URL ?? DEFAULT_MQTT_URL, clientId?: string) {
    this.client = mqtt.connect(brokerUrl, { clientId });
  }

  async publish(topic: string, payload: string): Promise<void> {
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
