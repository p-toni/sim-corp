# Device Identity & Signed Telemetry

## Overview

As of **T-027** (M2), all telemetry can be cryptographically signed using Ed25519 keypairs. This provides:

- **Provenance:** Verify that telemetry originated from a specific device
- **Integrity:** Detect tampering or corruption of telemetry data
- **Audit Trail:** Track which device generated which data points

## Architecture

### Components

1. **Device Identity Library** (`libs/device-identity`)
   - Ed25519 keypair generation
   - JWT-based signing (EdDSA algorithm)
   - Signature verification
   - File-based keystore

2. **Sim-Publisher** (`services/sim-publisher`)
   - Signs telemetry envelopes if keystore is configured
   - Automatically generates keypair for device on first use
   - Key ID format: `device:{machineId}@{siteId}`

3. **Ingestion Service** (`services/ingestion`)
   - Verifies signatures on incoming telemetry
   - Tracks verification results in metadata
   - Continues processing even if signature verification fails (graceful degradation)

### Signature Format

Signatures use **compact JWT** format:

```json
{
  "ts": "2026-01-04T00:00:00.000Z",
  "origin": {
    "orgId": "org-123",
    "siteId": "site-01",
    "machineId": "M-001"
  },
  "topic": "telemetry",
  "payload": { "btC": 168.2, "etC": 201.5, ... },
  "sig": "eyJhbGciOiJFZERTQSIsImtpZCI6ImRldmljZTpNLTAwMUBzaXRlLTAxIn0...",
  "kid": "device:M-001@site-01"
}
```

The `sig` field is a compact JWT containing:
- **Header:** `{ "alg": "EdDSA", "kid": "device:M-001@site-01" }`
- **Payload:** The telemetry data
- **Signature:** Ed25519 signature
- **Expiration:** 5 minutes from signing

## Setup

### 1. Configure Keystore Path

Set the keystore path via environment variable:

```bash
export DEVICE_KEYSTORE_PATH="./var/device-keys"
```

Or in Docker Compose:

```yaml
services:
  sim-publisher:
    environment:
      - DEVICE_KEYSTORE_PATH=/data/device-keys
    volumes:
      - ./var/device-keys:/data/device-keys
```

### 2. Enable Signing in Sim-Publisher

The sim-publisher automatically enables signing if a keystore path is configured:

```typescript
// In server.ts
const keystorePath = process.env.DEVICE_KEYSTORE_PATH ?? "./var/device-keys";
const publisher = new SimPublisherManager(mqttClient, simTwin, keystorePath);
```

On first run, the publisher will:
1. Generate an Ed25519 keypair for the device
2. Store keys in `{keystorePath}/device:{machineId}@{siteId}/`
3. Sign all subsequent telemetry with the private key

### 3. Verification in Ingestion

The ingestion service automatically verifies signatures:

```typescript
// In server.ts
const keystorePath = process.env.DEVICE_KEYSTORE_PATH ?? "./var/device-keys";
const signatureVerifier = new SignatureVerifier(new DeviceKeyStore(keystorePath));
const handlers = new IngestionHandlers(..., signatureVerifier);
```

Verification results are added to telemetry metadata:

```json
{
  "_verification": {
    "verified": true,
    "error": null
  }
}
```

## Keystore Structure

Keys are stored in the following structure:

```
var/device-keys/
├── device:M-001@site-01/
│   ├── public.pem         # Public key (SPKI format)
│   ├── private.pem        # Private key (PKCS8 format)
│   ├── public.jwk         # Public key (JWK format)
│   ├── private.jwk        # Private key (JWK format)
│   └── kid.txt            # Key ID
├── device:M-002@site-01/
│   └── ...
└── device:SIM-MACHINE@site/
    └── ...
```

### Key Rotation

To rotate keys for a device:

1. Delete the device's key directory
2. Restart the service (new keys will be auto-generated)
3. Update ingestion keystore with new public key

## Security Considerations

### Current Implementation (P0)

- **File-based keystore:** Keys stored as PEM files on disk
- **No key encryption:** Private keys are not encrypted at rest
- **Shared keystore:** Publisher and ingestion share the same keystore

This is suitable for:
- Development and testing
- Single-machine deployments
- Trusted network environments

### Production Hardening (Future)

For production deployments, consider:

1. **Hardware Security Module (HSM):** Store private keys in HSM
2. **Key encryption:** Encrypt private keys at rest (e.g., KMS-wrapped)
3. **Separate keystores:** Publisher uses private keys only, ingestion uses public keys only
4. **Key distribution:** Secure channel for distributing public keys to ingestion
5. **Revocation:** Implement key revocation lists or short-lived certificates
6. **Audit logging:** Log all signature generation and verification events

## Troubleshooting

### Signature Verification Fails

**Symptoms:**
- `_verification.verified` is `false`
- Error in logs: `Signature verification failed`

**Possible Causes:**
1. **Clock skew:** Signature expired (5-minute TTL)
   - Solution: Sync device clocks via NTP
2. **Key mismatch:** Ingestion has wrong public key
   - Solution: Ensure same keystore is accessible to both services
3. **Tampered data:** Payload was modified
   - Solution: Investigate data pipeline for corruption

### Unknown Device Key

**Symptoms:**
- `_verification.error`: `Unknown device key: device:XXX@YYY`

**Cause:** Ingestion hasn't seen this device before (key not in keystore)

**Solution:**
1. Copy device's public key to ingestion keystore
2. Or run sim-publisher and ingestion with shared keystore volume

### Missing Signatures

**Symptoms:**
- `_verification.verified` is `false`, no error
- `sig` and `kid` fields missing from envelope

**Cause:** Sim-publisher not configured with keystore path

**Solution:**
- Set `DEVICE_KEYSTORE_PATH` environment variable
- Or pass `keystorePath` to `buildServer()` options

## API Reference

### DeviceKeyStore

```typescript
import { DeviceKeyStore } from "@sim-corp/device-identity";

const keystore = new DeviceKeyStore("./var/device-keys");

// Generate and store new keypair
const keypair = await keystore.generateAndStore("device:M-001@site-01");

// Load existing keypair
const existing = await keystore.load("device:M-001@site-01");

// Get or create (idempotent)
const keypair = await keystore.getOrCreate("device:M-001@site-01");

// List all stored keys
const kids = await keystore.listKids();
```

### Signing Telemetry

```typescript
import { signTelemetry } from "@sim-corp/device-identity";

const payload = { btC: 168.2, etC: 201.5, rorCPerMin: 9.1 };
const privateKeyPem = "-----BEGIN PRIVATE KEY-----\n...";
const kid = "device:M-001@site-01";

const signed = await signTelemetry(payload, privateKeyPem, kid);
// { payload, sig: "eyJhbGc...", kid: "device:M-001@site-01" }
```

### Verifying Telemetry

```typescript
import { verifyTelemetry } from "@sim-corp/device-identity";

const sig = "eyJhbGc...";
const publicKeyPem = "-----BEGIN PUBLIC KEY-----\n...";
const expectedKid = "device:M-001@site-01";

try {
  const payload = await verifyTelemetry(sig, publicKeyPem, expectedKid);
  // Signature valid, returns payload
} catch (err) {
  // Signature invalid or expired
}
```

## Testing

### Unit Tests

```bash
# Test device-identity library
pnpm --filter @sim-corp/device-identity test

# Test sim-publisher signing
pnpm --filter @sim-corp/sim-publisher test

# Test ingestion verification
pnpm --filter @sim-corp/ingestion test
```

### Manual Testing

1. Start local stack with signing enabled:

```bash
export DEVICE_KEYSTORE_PATH=./var/device-keys
pnpm stack:up
```

2. Publish simulated roast:

```bash
curl -X POST http://127.0.0.1:4003/publish/start \
  -H "content-type: application/json" \
  -d '{
    "orgId": "org",
    "siteId": "site",
    "machineId": "SIM-MACHINE",
    "targetFirstCrackSeconds": 500,
    "targetDropSeconds": 650
  }'
```

3. Check ingestion logs for verification results:

```bash
pnpm stack:logs | grep verification
```

4. Inspect keystore:

```bash
ls -la ./var/device-keys/
cat ./var/device-keys/device:SIM-MACHINE@site/kid.txt
```

## Migration Guide

### Enabling Signatures on Existing Deployment

1. **Generate keys for existing devices:**

```bash
mkdir -p ./var/device-keys
# Keys will be auto-generated on first telemetry publish
```

2. **Update services to use keystore:**

```yaml
# docker-compose.yaml
services:
  sim-publisher:
    environment:
      - DEVICE_KEYSTORE_PATH=/data/device-keys
    volumes:
      - ./var/device-keys:/data/device-keys

  ingestion:
    environment:
      - DEVICE_KEYSTORE_PATH=/data/device-keys
    volumes:
      - ./var/device-keys:/data/device-keys
```

3. **Restart services:**

```bash
pnpm stack:down
pnpm stack:up
```

4. **Verify signing is working:**

```bash
pnpm stack:logs ingestion | grep "verified: true"
```

### Disabling Signatures

To disable signing (fall back to unsigned telemetry):

```bash
unset DEVICE_KEYSTORE_PATH
# Or don't pass keystorePath to buildServer()
```

Ingestion will continue to accept unsigned telemetry (graceful degradation).

## Roadmap

### Short Term
- ✅ T-027: Ed25519 signing + verification (DONE)
- Surface trust state in desktop UI (show verified badge)
- Add trust state to roast reports

### Medium Term
- Public key distribution via REST API
- Key rotation automation
- Signature metrics and monitoring
- Support for HSM/KMS key storage

### Long Term
- Short-lived certificates with automatic renewal
- Key revocation and audit trail
- Multi-signature support (require N of M keys)
- Zero-knowledge proofs for privacy-preserving verification
