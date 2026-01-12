# Secrets Management

This guide explains how to use the `@sim-corp/secrets` library to manage sensitive credentials and configuration across development and production environments.

## Overview

The Sim-Corp platform uses a pluggable secrets management system that supports:

- **Development**: Environment variables (EnvSecretProvider)
- **Production**: AWS Secrets Manager (AwsSecretsProvider)
- **Future**: HashiCorp Vault support (planned)

All secrets are accessed through a unified `ISecretProvider` interface, enabling seamless switching between environments without code changes.

## Architecture

```
┌─────────────┐
│  Services   │
├─────────────┤
│ SecretsHelper│ (Convenience methods)
├─────────────┤
│ISecretProvider│ (Abstract interface)
├─────────────┤
│ ┌─────────┐ ┌──────────┐ ┌────────┐ │
│ │   Env   │ │   AWS    │ │ Vault  │ │
│ │Provider │ │ Provider │ │Provider│ │
│ └─────────┘ └──────────┘ └────────┘ │
└─────────────┘
```

### Key Components

1. **ISecretProvider** - Abstract interface for all providers
2. **EnvSecretProvider** - Reads from `process.env` (dev mode)
3. **AwsSecretsProvider** - Integrates with AWS Secrets Manager (production)
4. **SecretsFactory** - Creates providers based on configuration
5. **SecretsHelper** - Convenience methods for common patterns

## Quick Start

### Development (Environment Variables)

```typescript
import { SecretsHelper } from '@sim-corp/secrets';

// Create helper (defaults to env provider)
const secrets = SecretsHelper.create();

// Get secrets
const apiKey = await secrets.getRequired('API_KEY');
const dbUrl = await secrets.getDatabaseUrl(); // Constructs PostgreSQL URL
const mqttUrl = await secrets.getMqttUrl();   // Constructs MQTT URL
const maxRetries = await secrets.getNumber('MAX_RETRIES', 3);
const debug = await secrets.getBoolean('DEBUG', false);
```

### Production (AWS Secrets Manager)

Set environment variables:

```bash
export SECRETS_PROVIDER=aws
export AWS_REGION=us-east-1
export SECRETS_CACHE_TTL=300  # 5 minutes
export SECRETS_AUDIT=true
```

Same code works in production - secrets are automatically fetched from AWS Secrets Manager with caching.

## Provider Configuration

### Environment Variables Provider (Default)

```typescript
import { EnvSecretProvider } from '@sim-corp/secrets';

const provider = new EnvSecretProvider(true); // enable audit logging

const apiKey = await provider.get('API_KEY');
const secrets = await provider.getByPrefix('DATABASE_');
```

No setup required - reads directly from `process.env`.

### AWS Secrets Manager Provider

```typescript
import { AwsSecretsProvider } from '@sim-corp/secrets';

const provider = new AwsSecretsProvider({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  },
  cacheTtl: 300, // Cache for 5 minutes
  enableAuditLogging: true
});

const secret = await provider.get('api-key');
const rotated = await provider.rotate('api-key');
```

## AWS Secrets Manager Setup

### 1. Create IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
        "secretsmanager:ListSecrets"
      ],
      "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:simcorp/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:CreateSecret",
        "secretsmanager:UpdateSecret",
        "secretsmanager:RotateSecret"
      ],
      "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:simcorp/*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "REGION"
        }
      }
    }
  ]
}
```

### 2. Attach Policy to Service Role

```bash
aws iam attach-role-policy \
  --role-name simcorp-service-role \
  --policy-arn arn:aws:iam::ACCOUNT:policy/simcorp-secrets-access
```

### 3. Create Secrets

```bash
# Database credentials
aws secretsmanager create-secret \
  --name simcorp/database/password \
  --secret-string "your-secure-password" \
  --region us-east-1

# API keys
aws secretsmanager create-secret \
  --name simcorp/api/key \
  --secret-string "sk-1234567890" \
  --region us-east-1

# MQTT credentials (structured)
aws secretsmanager create-secret \
  --name simcorp/mqtt/config \
  --secret-string '{"host":"mqtt.example.com","port":"1883","username":"mqttuser","password":"mqttpass"}' \
  --region us-east-1
```

### 4. Configure Secret Rotation (Optional)

```bash
aws secretsmanager rotate-secret \
  --secret-id simcorp/database/password \
  --rotation-lambda-arn arn:aws:lambda:REGION:ACCOUNT:function:simcorp-rotate-db-password \
  --rotation-rules AutomaticallyAfterDays=30
```

## SecretsHelper Convenience Methods

### Type Coercion

```typescript
const secrets = SecretsHelper.create();

// String (raw)
const apiKey = await secrets.getRequired('API_KEY');
const optional = await secrets.getOrDefault('OPTIONAL', 'default-value');

// Number
const port = await secrets.getNumber('PORT', 8080);
const timeout = await secrets.getNumber('TIMEOUT_MS', 5000);

// Boolean
const debug = await secrets.getBoolean('DEBUG', false);
const ssl = await secrets.getBoolean('ENABLE_SSL', true);

// JSON
const config = await secrets.getJson<{key: string}>('APP_CONFIG', {key: 'default'});
```

### URL Construction

```typescript
// Database URL
const dbUrl = await secrets.getDatabaseUrl();
// Tries DATABASE_URL first, then constructs from:
// - DATABASE_HOST
// - DATABASE_PORT (optional)
// - DATABASE_NAME
// - DATABASE_USER
// - DATABASE_PASSWORD
// Result: postgresql://user:pass@host:port/dbname

// MQTT URL
const mqttUrl = await secrets.getMqttUrl();
// Tries MQTT_URL first, then constructs from:
// - MQTT_HOST
// - MQTT_PORT (default: 1883)
// - MQTT_USERNAME (optional)
// - MQTT_PASSWORD (optional)
// Result: mqtt://user:pass@host:port
```

### Custom Prefix

```typescript
// Multiple databases
const primaryDb = await secrets.getDatabaseUrl('DATABASE');
const replicaDb = await secrets.getDatabaseUrl('DATABASE_REPLICA');

// Multiple MQTT brokers
const internalMqtt = await secrets.getMqttUrl('MQTT');
const externalMqtt = await secrets.getMqttUrl('MQTT_EXTERNAL');
```

## Caching

AWS Secrets Manager provider includes built-in caching to reduce API calls and costs.

### Configuration

```typescript
const provider = new AwsSecretsProvider({
  region: 'us-east-1',
  cacheTtl: 300 // Cache secrets for 5 minutes
});
```

### Manual Refresh

```typescript
// Clear cache and force refresh on next get()
await provider.refresh();

// Or use factory singleton
const provider = SecretsFactory.getInstance();
await provider.refresh?.();
```

## Audit Logging

Enable audit logging to track secret access:

```typescript
const provider = new EnvSecretProvider(true); // enable audit

await provider.get('API_KEY');
await provider.set?.('NEW_SECRET', 'value');

const auditLog = await provider.getAuditLog?.();
console.log(auditLog);
// [
//   {
//     timestamp: '2024-01-12T10:30:00Z',
//     operation: 'GET',
//     key: 'API_KEY',
//     success: true,
//     metadata: { duration: 2 }
//   }
// ]
```

For AWS provider:

```bash
export SECRETS_AUDIT=true
```

## Migration from Environment Variables

### Step 1: Update Code

```typescript
// Before
const dbHost = process.env.DATABASE_HOST;
const dbPort = parseInt(process.env.DATABASE_PORT || '5432');
const mqttUrl = process.env.MQTT_URL || 'mqtt://localhost:1883';

// After
import { SecretsHelper } from '@sim-corp/secrets';
const secrets = SecretsHelper.create();

const dbUrl = await secrets.getDatabaseUrl();
const mqttUrl = await secrets.getMqttUrl();
```

### Step 2: Test with Environment Variables

```bash
# No changes needed - defaults to env provider
export DATABASE_HOST=localhost
export DATABASE_PORT=5432
export MQTT_URL=mqtt://localhost:1883

pnpm test
```

### Step 3: Switch to AWS Secrets Manager

```bash
# Create secrets in AWS
aws secretsmanager create-secret \
  --name simcorp/database/host \
  --secret-string "db.prod.example.com"

# Update configuration
export SECRETS_PROVIDER=aws
export AWS_REGION=us-east-1

# Code automatically uses AWS Secrets Manager
pnpm start
```

## Service Integration

Services use the secrets library for all credential management:

```typescript
// services/event-inference/src/server.ts
import { SecretsHelper } from '@sim-corp/secrets';

export async function buildServer() {
  // MQTT URL from secrets
  const mqttUrl = process.env.MQTT_URL ?? 'mqtt://127.0.0.1:1883';
  const mqttClient = new RealMqttClient(mqttUrl);

  // ... rest of setup
}
```

## Security Best Practices

### 1. Never Commit Secrets

```bash
# .gitignore
.env
.env.local
*.key
*.pem
```

### 2. Use IAM Roles (Not Access Keys)

In production, use IAM roles attached to EC2/ECS/Lambda instead of hardcoded credentials:

```typescript
// AWS SDK automatically uses IAM role credentials
const provider = new AwsSecretsProvider({
  region: 'us-east-1'
  // No credentials needed - uses IAM role
});
```

### 3. Rotate Secrets Regularly

```bash
# Enable automatic rotation
aws secretsmanager rotate-secret \
  --secret-id simcorp/database/password \
  --rotation-rules AutomaticallyAfterDays=30
```

### 4. Limit Secret Access

Use least-privilege IAM policies:

```json
{
  "Effect": "Allow",
  "Action": ["secretsmanager:GetSecretValue"],
  "Resource": "arn:aws:secretsmanager:*:*:secret:simcorp/service-name/*"
}
```

### 5. Monitor Secret Access

Enable CloudTrail logging for Secrets Manager:

```bash
aws cloudtrail create-trail \
  --name simcorp-secrets-audit \
  --s3-bucket-name simcorp-audit-logs
```

## Cost Considerations

### AWS Secrets Manager Pricing (us-east-1)

- **Storage**: $0.40 per secret per month
- **API Calls**: $0.05 per 10,000 calls

### Example Calculation

For 20 secrets with 5-minute cache TTL:

```
Storage: 20 secrets × $0.40 = $8/month
API calls: 20 secrets × 12 calls/hour × 730 hours/month = 175,200 calls
           175,200 / 10,000 × $0.05 = $0.88/month
Total: ~$9/month
```

Caching dramatically reduces API costs!

## Troubleshooting

### Error: "Required secret not found"

**Cause**: Secret key doesn't exist

**Solution**:
```bash
# Check if secret exists
aws secretsmanager get-secret-value --secret-id simcorp/your-secret

# Create if missing
aws secretsmanager create-secret \
  --name simcorp/your-secret \
  --secret-string "value"
```

### Error: "AccessDeniedException"

**Cause**: IAM role lacks permissions

**Solution**:
```bash
# Attach secrets policy to role
aws iam attach-role-policy \
  --role-name your-service-role \
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
```

### Error: "ResourceNotFoundException"

**Cause**: Secret deleted or wrong region

**Solution**:
```bash
# Check region matches
export AWS_REGION=us-east-1

# List secrets
aws secretsmanager list-secrets --region us-east-1
```

### High AWS Costs

**Cause**: Cache TTL too short

**Solution**:
```bash
# Increase cache TTL to reduce API calls
export SECRETS_CACHE_TTL=600  # 10 minutes
```

## Testing

### Mock Provider for Tests

```typescript
import { describe, it, expect } from 'vitest';
import type { ISecretProvider } from '@sim-corp/secrets';

class MockSecretProvider implements ISecretProvider {
  private secrets = new Map<string, string>();

  async get(key: string) {
    return this.secrets.get(key) ?? null;
  }

  async getMany(keys: string[]) {
    const result = new Map<string, string | null>();
    for (const key of keys) {
      result.set(key, this.secrets.get(key) ?? null);
    }
    return result;
  }

  async getByPrefix(prefix: string) {
    const result = new Map<string, string>();
    for (const [key, value] of this.secrets) {
      if (key.startsWith(prefix)) {
        result.set(key, value);
      }
    }
    return result;
  }

  // Helper for tests
  setSecret(key: string, value: string) {
    this.secrets.set(key, value);
  }
}

describe('MyService', () => {
  it('uses secrets correctly', async () => {
    const mockSecrets = new MockSecretProvider();
    mockSecrets.setSecret('API_KEY', 'test-key');

    const service = new MyService(mockSecrets);
    // ... test
  });
});
```

## Next Steps

1. **Migrate services** to use `@sim-corp/secrets` for all credential access
2. **Set up AWS Secrets Manager** in production environments
3. **Enable audit logging** to track secret access patterns
4. **Configure rotation** for database and API credentials
5. **Monitor costs** using AWS Cost Explorer

## Related Documentation

- [HSM Setup Guide](./hsm-setup.md) - Hardware security for device identity keys
- [Monitoring Setup](../infra/monitoring.md) - Prometheus metrics and Grafana dashboards
- [Security Architecture](../architecture/security.md) - Overall security design
