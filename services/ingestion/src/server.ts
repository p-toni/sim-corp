import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { TelemetryStore, EventStore } from "./core/store";
import { IngestionHandlers } from "./core/handlers";
import { attachMqttHandlers } from "./core/router";
import { RealMqttClient, type MqttClient } from "./mqtt-client";
import { registerHealthRoutes } from "./routes/health";
import { registerTelemetryRoutes } from "./routes/telemetry";
import { registerEventRoutes } from "./routes/events";
import { registerStreamRoutes } from "./routes/stream";
import { openDatabase } from "./db/connection";
import { IngestionRepository } from "./db/repo";
import { Sessionizer } from "./core/sessionizer";
import { PersistencePipeline } from "./core/persist";
import { registerSessionRoutes } from "./routes/sessions";
import { EnvelopeStream } from "./core/envelope-stream";
import { registerEnvelopeStreamRoutes } from "./routes/stream-envelopes";
import { registerSessionQcRoutes } from "./routes/sessions-qc";
import { registerSessionReportRoutes } from "./routes/session-reports";
import { ReportMissionEnqueuer } from "./core/report-missions";
import { MqttOpsEventPublisher, type OpsEventPublisher } from "./ops/publisher";
import { registerProfileRoutes } from "./routes/profiles";
import { registerAuth } from "./auth";
import { DeviceKeyStore } from "@sim-corp/device-identity";
import { SignatureVerifier } from "./core/signature-verifier";
import { EvalServiceClient } from "./core/eval-client";
import { AutoEvaluator } from "./core/auto-evaluator";
import { initializeMetrics, metricsHandler, createCounter, createGauge, Registry as PrometheusRegistry } from "@sim-corp/metrics";

interface BuildServerOptions {
  logger?: FastifyServerOptions["logger"];
  telemetryStore?: TelemetryStore;
  eventStore?: EventStore;
  mqttClient?: MqttClient | null;
  opsPublisher?: OpsEventPublisher | null;
  keystorePath?: string;
  evalServiceUrl?: string;
  autoEvalEnabled?: boolean;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  // Initialize Prometheus metrics
  const metricsRegistry = new PrometheusRegistry();
  const httpMetrics = initializeMetrics({
    serviceName: 'ingestion',
    collectDefaultMetrics: true,
    prefix: 'simcorp',
    registry: metricsRegistry,
  });

  // Add HTTP metrics middleware
  app.addHook('onRequest', httpMetrics.middleware('ingestion'));

  // Business metrics for ingestion
  const telemetryPointsTotal = createCounter({
    name: 'simcorp_telemetry_points_total',
    help: 'Total number of telemetry points ingested',
    labelNames: ['device_id', 'verified'],
    registry: metricsRegistry,
  });

  const sessionsActiveGauge = createGauge({
    name: 'simcorp_sessions_active',
    help: 'Number of currently active roasting sessions',
    registry: metricsRegistry,
  });

  const sessionsClosedTotal = createCounter({
    name: 'simcorp_sessions_closed_total',
    help: 'Total number of sessions closed',
    labelNames: ['reason'],
    registry: metricsRegistry,
  });

  const verificationRateGauge = createGauge({
    name: 'simcorp_telemetry_verification_rate',
    help: 'Percentage of telemetry points successfully verified',
    registry: metricsRegistry,
  });

  // Expose metrics for pipeline instrumentation
  app.decorate('metrics', {
    telemetryPointsTotal,
    sessionsActiveGauge,
    sessionsClosedTotal,
    verificationRateGauge,
    registry: metricsRegistry,
  });

  const telemetryStore = options.telemetryStore ?? new TelemetryStore();
  const eventStore = options.eventStore ?? new EventStore();
  const db = openDatabase();
  const repo = new IngestionRepository(db);
  const sessionizer = new Sessionizer();
  const opsPublisher = resolveOpsPublisher(options.opsPublisher, app);
  const reportMissionEnqueuer = new ReportMissionEnqueuer({
    repo,
    logger: app.log,
    kernelUrl: process.env.INGESTION_KERNEL_URL,
    opsPublisher
  });

  // Setup auto-evaluator if enabled
  const evalServiceUrl = options.evalServiceUrl ?? process.env.EVAL_SERVICE_URL ?? "http://127.0.0.1:4007";
  const autoEvalEnabled = options.autoEvalEnabled ?? process.env.AUTO_EVAL_ENABLED === "true";
  const analyticsUrl = process.env.ANALYTICS_URL ?? "http://127.0.0.1:4006";
  const commandServiceUrl = process.env.COMMAND_SERVICE_URL ?? "http://127.0.0.1:3004";

  const evalClient = autoEvalEnabled ? new EvalServiceClient({ baseUrl: evalServiceUrl }) : null;
  const autoEvaluator = new AutoEvaluator(
    evalClient,
    { enabled: autoEvalEnabled, analyticsUrl, commandServiceUrl },
    app.log
  );

  const persist = new PersistencePipeline({
    repo,
    sessionizer,
    onSessionClosed: async (session) => {
      await reportMissionEnqueuer.handleSessionClosed(session);
      await autoEvaluator.handleSessionClosed(session);
    }
  });
  const envelopeStream = new EnvelopeStream();

  // Setup signature verification if keystore path is provided
  const keystorePath = options.keystorePath ?? process.env.DEVICE_KEYSTORE_PATH ?? "./var/device-keys";
  const signatureVerifier = new SignatureVerifier(new DeviceKeyStore(keystorePath));

  const handlers = new IngestionHandlers(telemetryStore, eventStore, persist, envelopeStream, signatureVerifier);

  const mqttClient = resolveMqttClient(options.mqttClient, app);
  if (mqttClient) {
    attachMqttHandlers(mqttClient, handlers, { logger: app.log });
    app.addHook("onClose", async () => {
      await mqttClient.disconnect().catch((error: unknown) => {
        app.log.error(error, "Failed to disconnect MQTT client");
      });
    });
  } else {
    app.log.warn("INGESTION_MQTT_URL not set; running without MQTT ingestion");
  }

  if (opsPublisher) {
    app.addHook("onClose", async () => {
      await opsPublisher.disconnect().catch((error: unknown) => {
        app.log.error(error, "Failed to disconnect ops MQTT publisher");
      });
    });
  }

  const tickInterval = setInterval(() => {
    persist.tick(new Date().toISOString());
  }, 1000);
  app.addHook("onClose", async () => {
    clearInterval(tickInterval);
  });

  registerHealthRoutes(app);
  registerAuth(app);
  registerTelemetryRoutes(app, { telemetryStore });
  registerEventRoutes(app, { eventStore });
  registerStreamRoutes(app, { telemetryStore, eventStore });
  registerSessionRoutes(app, { repo });
  registerSessionQcRoutes(app, { repo });
  registerSessionReportRoutes(app, { repo });
  registerProfileRoutes(app, { repo });
  registerEnvelopeStreamRoutes(app, { envelopeStream });

  // Prometheus metrics endpoint
  app.get('/metrics', async (_, reply) => {
    const metrics = await metricsHandler(metricsRegistry);
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return metrics;
  });

  return app;
}

function resolveMqttClient(providedClient: MqttClient | null | undefined, app: FastifyInstance): MqttClient | null {
  if (providedClient === null) {
    return null;
  }
  if (providedClient) {
    return providedClient;
  }

  const brokerUrl = process.env.INGESTION_MQTT_URL;
  if (!brokerUrl) {
    return null;
  }

  const clientId = process.env.INGESTION_MQTT_CLIENT_ID;
  try {
    return new RealMqttClient(brokerUrl, clientId);
  } catch (error) {
    app.log.error(error, "Failed to initialize MQTT client");
    return null;
  }
}

function resolveOpsPublisher(provided: OpsEventPublisher | null | undefined, app: FastifyInstance): OpsEventPublisher | null {
  const flag = process.env.INGESTION_OPS_EVENTS_ENABLED ?? "false";
  if (flag.toLowerCase() !== "true") {
    return null;
  }
  if (provided === null) {
    return null;
  }
  if (provided) {
    return provided;
  }

  const brokerUrl = process.env.INGESTION_OPS_MQTT_URL ?? process.env.INGESTION_MQTT_URL;
  if (!brokerUrl) {
    app.log.warn("INGESTION_OPS_EVENTS_ENABLED is true but INGESTION_OPS_MQTT_URL is not set");
    return null;
  }

  try {
    return new MqttOpsEventPublisher(brokerUrl, process.env.INGESTION_OPS_MQTT_CLIENT_ID);
  } catch (error) {
    app.log.error(error, "Failed to initialize ops MQTT publisher");
    return null;
  }
}
