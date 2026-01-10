#!/usr/bin/env node
/**
 * Automated script to add health checks and graceful shutdown to services
 * Adds @sim-corp/health dependency, imports, and health check setup
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const services = [
  { name: 'command', hasDatabase: true, hasMqtt: false },
  { name: 'eval', hasDatabase: true, hasMqtt: false },
  { name: 'analytics', hasDatabase: false, hasMqtt: false },
  { name: 'sim-twin', hasDatabase: false, hasMqtt: false },
  { name: 'sim-publisher', hasDatabase: false, hasMqtt: true },
  { name: 'driver-bridge', hasDatabase: false, hasMqtt: true },
  { name: 'event-inference', hasDatabase: false, hasMqtt: true },
  { name: 'dispatcher', hasDatabase: false, hasMqtt: true },
  { name: 'report-worker', hasDatabase: false, hasMqtt: false, hasHttp: false },
];

console.log('🏥 Adding health checks to services...\n');

for (const service of services) {
  if (service.hasHttp === false) {
    console.log(`⏭️  Skipping ${service.name} (no HTTP server)`);
    continue;
  }

  console.log(`📦 Processing ${service.name}...`);

  try {
    // 1. Add @sim-corp/health to package.json
    const packagePath = `services/${service.name}/package.json`;
    if (!existsSync(packagePath)) {
      console.log(`  ⚠️  package.json not found at ${packagePath}`);
      continue;
    }

    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    if (!pkg.dependencies['@sim-corp/health']) {
      pkg.dependencies['@sim-corp/health'] = 'workspace:*';
      writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`  ✅ Added @sim-corp/health dependency`);
    } else {
      console.log(`  ℹ️  @sim-corp/health already in dependencies`);
    }

    // 2. Update server.ts to add health checks
    const serverPath = `services/${service.name}/src/server.ts`;
    if (!existsSync(serverPath)) {
      console.log(`  ⚠️  server.ts not found at ${serverPath}`);
      continue;
    }

    let content = readFileSync(serverPath, 'utf8');

    // Check if health library is already imported
    if (content.includes('@sim-corp/health')) {
      console.log(`  ℹ️  @sim-corp/health already imported`);
      continue;
    }

    // Add import statement after @sim-corp/metrics import
    const metricsImportRegex = /(import.*from ['"]@sim-corp\/metrics['"];?\n)/;
    if (metricsImportRegex.test(content)) {
      const imports = [];
      imports.push('setupHealthAndShutdown');
      if (service.hasDatabase) imports.push('createDatabaseChecker');
      if (service.hasMqtt) imports.push('createMqttChecker');

      const healthImport = `import { ${imports.join(', ')} } from "@sim-corp/health";\n`;
      content = content.replace(metricsImportRegex, `$1${healthImport}`);
      console.log(`  ✅ Added health library import`);
    } else {
      console.log(`  ⚠️  Could not find @sim-corp/metrics import`);
      continue;
    }

    // Add enableGracefulShutdown to BuildServerOptions interface
    const interfaceRegex = /(interface BuildServerOptions \{[^}]+)(})/s;
    if (interfaceRegex.test(content)) {
      content = content.replace(interfaceRegex, '$1  enableGracefulShutdown?: boolean;\n$2');
      console.log(`  ✅ Added enableGracefulShutdown to BuildServerOptions`);
    }

    // Find where registerHealthRoutes is called and replace it
    const healthRouteRegex = /([ \t]*)(?:await )?registerHealthRoutes\(app\);?\n/;
    if (healthRouteRegex.test(content)) {
      const indent = content.match(healthRouteRegex)[1];

      // Build dependencies object
      let dependenciesCode = `${indent}// Setup health checks and graceful shutdown\n`;

      if (service.hasDatabase || service.hasMqtt) {
        dependenciesCode += `${indent}const dependencies: Record<string, () => Promise<{ status: 'healthy' | 'unhealthy'; message?: string; latency?: number }>> = {};\n`;
        if (service.hasDatabase) {
          dependenciesCode += `${indent}dependencies.database = createDatabaseChecker(db);\n`;
        }
        if (service.hasMqtt) {
          dependenciesCode += `${indent}if (mqttClient) {\n`;
          dependenciesCode += `${indent}  dependencies.mqtt = createMqttChecker(mqttClient);\n`;
          dependenciesCode += `${indent}}\n`;
        }
      }

      dependenciesCode += `${indent}setupHealthAndShutdown(app, {\n`;
      dependenciesCode += `${indent}  serviceName: '${service.name}',\n`;
      if (service.hasDatabase || service.hasMqtt) {
        dependenciesCode += `${indent}  dependencies,\n`;
      }
      dependenciesCode += `${indent}  includeSystemMetrics: true,\n`;
      dependenciesCode += `${indent}}, options.enableGracefulShutdown !== false ? {\n`;
      dependenciesCode += `${indent}  timeout: 10000,\n`;
      dependenciesCode += `${indent}  logger: app.log,\n`;
      dependenciesCode += `${indent}} : undefined);\n\n`;

      content = content.replace(healthRouteRegex, dependenciesCode);
      console.log(`  ✅ Replaced registerHealthRoutes with setupHealthAndShutdown`);
    } else {
      console.log(`  ⚠️  Could not find registerHealthRoutes call`);
    }

    writeFileSync(serverPath, content);
    console.log(`  ✅ Updated server.ts\n`);

  } catch (error) {
    console.error(`  ❌ Error processing ${service.name}:`, error.message, '\n');
  }
}

console.log('\n🔧 Installing dependencies...');
try {
  await execAsync('pnpm install');
  console.log('✅ Dependencies installed\n');
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message, '\n');
}

console.log('🏗️  Building health library...');
try {
  await execAsync('pnpm --filter @sim-corp/health build');
  console.log('✅ Health library built\n');
} catch (error) {
  console.error('❌ Failed to build health library:', error.message, '\n');
}

console.log('✅ Health checks added to all services!\n');
console.log('⚠️  Next steps:');
console.log('  1. Update tests to pass { enableGracefulShutdown: false }');
console.log('  2. Run tests: pnpm -r test');
console.log('  3. Update Docker healthchecks to use /ready');
