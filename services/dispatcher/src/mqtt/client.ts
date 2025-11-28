import mqtt, { type MqttClient as RawMqttClient } from "mqtt";

export type MessageHandler = (topic: string, payload: Buffer) => void | Promise<void>;

export interface MqttSubscriber {
  subscribe(topic: string | string[], handler: MessageHandler): Promise<void>;
  disconnect(): Promise<void>;
  getUrl(): string;
}

export class DispatcherMqttClient implements MqttSubscriber {
  private readonly client: RawMqttClient;

  constructor(private readonly brokerUrl: string, clientId?: string) {
    this.client = mqtt.connect(brokerUrl, { clientId });
  }

  getUrl(): string {
    return this.brokerUrl;
  }

  async subscribe(topic: string | string[], handler: MessageHandler): Promise<void> {
    this.client.on("message", (messageTopic: string, payload: Buffer) => {
      void Promise.resolve(handler(messageTopic, payload)).catch(() => {
        /* handled upstream */
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.client.subscribe(topic, (err?: Error) => {
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
