# HSM Integration for Device Identity

## Overview

T-036 adds Hardware Security Module (HSM) integration for production device identity. This provides secure key storage and signing operations where private keys never leave the HSM.

## Architecture

### Development Mode (File-based)
- **Keystore:** `FileKeyStore` - stores keys on disk in `./var/device-keys`
- **Algorithm:** Ed25519 (EdDSA)
- **Signer:** `LocalSigner` - signs using private keys from disk
- **Use case:** Local development, testing

### Production Mode (HSM-based)
- **Keystore:** `AwsKmsKeyStore` - keys stored in AWS KMS
- **Algorithm:** ECDSA P-256 (ES256) - AWS KMS doesn't support Ed25519
- **Signer:** `AwsKmsSigner` - signs via KMS API (private key never exposed)
- **Use case:** Production deployments

## AWS KMS Setup

### Prerequisites

1. **AWS Account** with KMS permissions
2. **IAM Role or User** with the following permissions:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "kms:CreateKey",
           "kms:CreateAlias",
           "kms:DescribeKey",
           "kms:GetPublicKey",
           "kms:Sign",
           "kms:ListAliases"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

### Configuration

#### Environment Variables

```bash
# HSM Mode
DEVICE_IDENTITY_MODE=hsm
HSM_PROVIDER=aws-kms

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-access-key>
AWS_SECRET_ACCESS_KEY=<your-secret-key>

# Optional: Enable audit logging
DEVICE_IDENTITY_AUDIT=true
```

#### Programmatic Configuration

```typescript
import { DeviceIdentityFactory } from "@sim-corp/device-identity";

const { keystore, signer } = DeviceIdentityFactory.create({
  mode: "hsm",
  hsmProvider: "aws-kms",
  hsmConfig: {
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
    }
  },
  auditLogging: true
});
```

### Key Generation

When a device registers, a new ECDSA P-256 key is created in KMS:

```typescript
// Automatic key generation on first use
const kid = "device:machine123@site1";
const keypair = await keystore.getOrCreate(kid);

// keypair.hsmKeyId contains the KMS key ID
// keypair.privateKey is empty (never leaves HSM)
```

### Signing Operations

```typescript
// Sign telemetry payload
const payload = {
  machineId: "machine123",
  temperature: 200,
  timestamp: new Date().toISOString()
};

const signed = await signer.sign(payload, kid);

// signed.sig is a compact JWT with ES256 algorithm
// Private key never exposed
```

### Key Rotation

```typescript
// Rotate a device key (creates new key, archives old)
const newKeypair = await keystore.rotate(kid);

// Old key is kept in KMS but alias is updated to new key
```

## Backward Compatibility

The implementation maintains full backward compatibility:

1. **File-based mode still works** - Ed25519 keys on disk
2. **DeviceKeyStore alias** - legacy code continues to work
3. **signTelemetry function** - still available for direct use

## Security Benefits

### Private Key Protection
- **File-based:** Private keys stored on disk (vulnerable to compromise)
- **HSM-based:** Private keys never leave HSM hardware (FIPS 140-2 Level 2+)

### Audit Trail
- All HSM operations logged with timestamps
- Sign operations, key generation, key rotation tracked
- queryable audit log via `signer.getAuditLog()`

### Key Rotation
- Automated key rotation support
- Old keys archived, not deleted
- Zero-downtime rotation

## Cost Considerations

### AWS KMS Pricing (us-east-1, as of 2026)
- **Key storage:** $1/month per key
- **Sign operations:** $0.03 per 10,000 requests

### Example Costs
- **100 devices:** $100/month storage
- **1M telemetry signs/month:** $3 signing cost
- **Total:** ~$103/month for 100 devices with 10k signs/device/month

## Migration Path

### Development → Production

1. **Develop with file-based keys:**
   ```bash
   DEVICE_IDENTITY_MODE=file
   DEVICE_KEYSTORE_PATH=./var/device-keys
   ```

2. **Test HSM integration in staging:**
   ```bash
   DEVICE_IDENTITY_MODE=hsm
   HSM_PROVIDER=aws-kms
   AWS_REGION=us-east-1
   ```

3. **Deploy to production** with IAM role (no access keys):
   ```bash
   DEVICE_IDENTITY_MODE=hsm
   HSM_PROVIDER=aws-kms
   AWS_REGION=us-east-1
   # No AWS_ACCESS_KEY_ID needed - uses IAM role
   ```

### Re-enrolling Devices

If switching from file-based to HSM:

1. **Generate new keys in HSM** for each device
2. **Update device configuration** to use new kid
3. **Gradual rollout** - both modes can coexist

## Troubleshooting

### "KMS key not found"
- Check AWS region matches
- Verify alias format: `alias/device/{kid with special chars replaced}`
- Check IAM permissions for `kms:GetPublicKey`

### "Signature verification failed"
- File-based keys use Ed25519, HSM uses ECDSA P-256
- Verify correct public key retrieved
- Check signature algorithm matches (EdDSA vs ES256)

### "AWS credentials not configured"
- Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` or
- Use IAM role (recommended for production)
- Check `AWS_REGION` is set

## Future Enhancements

### Planned (Not Yet Implemented)
- **GCP Cloud KMS** support
- **Azure Key Vault** support
- **Automatic key rotation** via cron job
- **Multi-region key replication**
- **Key usage monitoring** and alerting

## References

- **AWS KMS Developer Guide:** https://docs.aws.amazon.com/kms/latest/developerguide/
- **AWS KMS Pricing:** https://aws.amazon.com/kms/pricing/
- **ECDSA P-256 (ES256):** RFC 7518 Section 3.4
- **Ed25519 (EdDSA):** RFC 8032

## Examples

### Complete Publisher Integration

```typescript
import { DeviceIdentityFactory } from "@sim-corp/device-identity";

// Create from environment variables
const { keystore, signer } = DeviceIdentityFactory.createFromEnv();

// Use in sim-publisher
const manager = new SimPublisherManager(
  mqttClient,
  simTwinClient,
  undefined // keystorePath not needed, uses environment
);

// Signing happens automatically via ISigner interface
```

### Audit Log Inspection

```typescript
// Get audit log from signer
const auditLog = await signer.getAuditLog!();

// Example entry:
// {
//   timestamp: "2026-01-12T10:00:00Z",
//   operation: "SIGN",
//   kid: "device:machine123@site1",
//   success: true,
//   metadata: {
//     duration: 45 // milliseconds
//   }
// }
```

### Key Rotation Script

```typescript
import { DeviceIdentityFactory } from "@sim-corp/device-identity";

const { keystore } = DeviceIdentityFactory.createFromEnv();

// Rotate all device keys
const kids = await keystore.listKids();

for (const kid of kids) {
  console.log(`Rotating key: ${kid}`);
  const newKeypair = await keystore.rotate!(kid);
  console.log(`New key ID: ${newKeypair.hsmKeyId}`);
}
```
