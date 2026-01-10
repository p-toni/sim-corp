#!/usr/bin/env node
/**
 * Script to add @sim-corp/metrics dependency and basic metrics to all services
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const services = [
  { name: 'command', port: 3004 },
  { name: 'eval', port: 4007 },
  { name: 'analytics', port: 4006 },
  { name: 'sim-twin', port: 4002 },
  { name: 'sim-publisher', port: 4003 },
  { name: 'driver-bridge', port: 4004 },
  { name: 'event-inference', port: 4005 },
  { name: 'report-worker', port: 4008 },
  { name: 'dispatcher', port: 4010 },
];

function addMetricsDependency(serviceName) {
  const packagePath = `services/${serviceName}/package.json`;
  console.log(`Adding @sim-corp/metrics to ${serviceName}...`);

  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));

  if (!pkg.dependencies['@sim-corp/metrics']) {
    pkg.dependencies['@sim-corp/metrics'] = 'workspace:*';
    writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`  ✓ Added dependency to ${serviceName}`);
  } else {
    console.log(`  - Dependency already exists in ${serviceName}`);
  }
}

function addMetricsToServer(serviceName, port) {
  const serverPath = `services/${serviceName}/src/server.ts`;
  console.log(`Adding metrics to ${serviceName}/src/server.ts...`);

  try {
    let content = readFileSync(serverPath, 'utf8');

    // Skip if metrics already added
    if (content.includes('@sim-corp/metrics')) {
      console.log(`  - Metrics already added to ${serviceName}`);
      return;
    }

    // Add import
    const importLine = `import { initializeMetrics, metricsHandler, Registry as PrometheusRegistry } from "@sim-corp/metrics";`;

    // Find the last import
    const lastImportMatch = content.match(/import .+ from .+;(?=\n\n)/g);
    if (lastImportMatch) {
      const lastImport = lastImportMatch[lastImportMatch.length - 1];
      content = content.replace(lastImport, lastImport + '\n' + importLine);
    }

    // Add metrics initialization after Fastify app creation
    const appCreationRegex = /(const app = Fastify\([^)]*\);)/;
    const metricsCode = `
  // Initialize Prometheus metrics
  const metricsRegistry = new PrometheusRegistry();
  const httpMetrics = initializeMetrics({
    serviceName: '${serviceName}',
    collectDefaultMetrics: true,
    prefix: 'simcorp',
    registry: metricsRegistry,
  });

  // Add HTTP metrics middleware
  app.addHook('onRequest', httpMetrics.middleware('${serviceName}'));`;

    content = content.replace(appCreationRegex, `$1${metricsCode}`);

    // Add /metrics endpoint before return app
    const metricsEndpoint = `
  // Prometheus metrics endpoint
  app.get('/metrics', async (_, reply) => {
    const metrics = await metricsHandler(metricsRegistry);
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return metrics;
  });

  return app;`;

    content = content.replace(/\n  return app;\n}/, metricsEndpoint + '\n}');

    writeFileSync(serverPath, content);
    console.log(`  ✓ Added metrics to ${serviceName}/src/server.ts`);
  } catch (error) {
    console.log(`  ✗ Failed to add metrics to ${serviceName}: ${error.message}`);
  }
}

// Process all services
for (const service of services) {
  addMetricsDependency(service.name);
  addMetricsToServer(service.name, service.port);
  console.log('');
}

console.log('✓ Metrics added to all services!');
