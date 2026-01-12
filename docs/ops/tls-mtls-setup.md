# TLS & mTLS Setup Guide

This guide explains how to configure TLS (Transport Layer Security) and mTLS (mutual TLS) for the Sim-Corp platform to encrypt all communication in production.

## Overview

The Sim-Corp platform uses a comprehensive TLS/mTLS system that provides:

- **TLS for ingress**: Encrypt client → service communication
- **mTLS for service-to-service**: Mutual authentication between internal services
- **Certificate lifecycle management**: Automatic generation, rotation, and validation
- **Multiple providers**: Self-signed (dev), file-based (Let's Encrypt), AWS ACM (production)
- **Zero-downtime rotation**: Automatic certificate renewal before expiry

## Architecture

```
┌────────────────────────────────────────────────────┐
│ Production TLS Architecture                        │
│                                                    │
│ ┌────────────────────────────────────────────────┐│
│ │ Load Balancer / Ingress Controller             ││
│ │ - TLS Termination (client certificates)        ││
│ │ - Let's Encrypt / ACM integration              ││
│ └─────────────────┬──────────────────────────────┘│
│                   │ HTTPS                          │
│ ┌─────────────────▼──────────────────────────────┐│
│ │ Service Mesh (Optional: Istio/Linkerd)         ││
│ │ - mTLS between services                        ││
│ │ - Certificate auto-rotation                    ││
│ │ - Mutual authentication                        ││
│ └─────────────────┬──────────────────────────────┘│
│                   │ mTLS                           │
│ ┌─────────────────▼──────────────────────────────┐│
│ │ Sim-Corp Services                              ││
│ │ - company-kernel, ingestion, sim-twin, etc.    ││
│ │ - TLS-enabled HTTP servers                     ││
│ │ - Client certificates for outbound requests    ││
│ └────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────┘
```

## Quick Start

### Development (Self-Signed Certificates)

```typescript
import { TlsFactory, FastifyTlsHelper } from '@sim-corp/tls';
import Fastify from 'fastify';

// Create TLS manager
const tlsManager = TlsFactory.createFromEnv();

// Initialize with self-signed certificates
await tlsManager.initialize({
  serverCommonName: 'localhost',
  serverAltNames: ['127.0.0.1', '::1']
});

// Get HTTPS options for Fastify
const httpsOptions = await FastifyTlsHelper.getHttpsOptions(tlsManager);

// Create HTTPS server
const app = Fastify({
  logger: true,
  https: httpsOptions
});

await app.listen({ port: 3000, host: '0.0.0.0' });
console.log('HTTPS server running on https://localhost:3000');
```

### Environment Variables

```bash
# Enable TLS
export TLS_ENABLED=true

# Provider: 'self-signed', 'file', 'acm', 'lets-encrypt'
export TLS_PROVIDER=self-signed

# mTLS (require client certificates)
export TLS_MTLS_ENABLED=false

# Auto-renewal
export TLS_AUTO_RENEW=true
export TLS_RENEWAL_THRESHOLD_DAYS=30
```

## Certificate Providers

### 1. Self-Signed (Development Only)

Self-signed certificates for local development and testing.

```typescript
import { TlsFactory } from '@sim-corp/tls';

const manager = TlsFactory.createManager({
  enabled: true,
  provider: 'self-signed'
});

await manager.initialize({
  serverCommonName: 'localhost',
  serverAltNames: ['127.0.0.1']
});
```

**Pros:**
- No setup required
- Works offline
- Fast generation

**Cons:**
- Not trusted by browsers/clients (requires manual trust)
- Not suitable for production
- No external validation

### 2. File-Based (Let's Encrypt, Manual)

Load certificates from the filesystem. Use with Let's Encrypt or manually provided certificates.

```bash
# Environment variables
export TLS_ENABLED=true
export TLS_PROVIDER=file
export TLS_CERT_PATH=/etc/sim-corp/certs/server.crt
export TLS_KEY_PATH=/etc/sim-corp/certs/server.key
export TLS_CA_PATH=/etc/sim-corp/certs/ca.crt
```

#### Let's Encrypt with Certbot

```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone \
  -d api.example.com \
  -d *.api.example.com \
  --email admin@example.com \
  --agree-tos \
  --non-interactive

# Certificates saved to /etc/letsencrypt/live/api.example.com/

# Copy to application directory
sudo cp /etc/letsencrypt/live/api.example.com/fullchain.pem /etc/sim-corp/certs/server.crt
sudo cp /etc/letsencrypt/live/api.example.com/privkey.pem /etc/sim-corp/certs/server.key
sudo cp /etc/letsencrypt/live/api.example.com/chain.pem /etc/sim-corp/certs/ca.crt

# Set permissions
sudo chown sim-corp:sim-corp /etc/sim-corp/certs/*
sudo chmod 600 /etc/sim-corp/certs/server.key
```

#### Auto-Renewal with Certbot

```bash
# Test renewal
sudo certbot renew --dry-run

# Setup cron job for auto-renewal
sudo crontab -e

# Add line (runs twice daily):
0 */12 * * * certbot renew --post-hook "systemctl restart sim-corp-services"
```

### 3. AWS Certificate Manager (ACM)

For AWS deployments, use ACM at the load balancer level.

**Setup:**

1. **Create Certificate in ACM:**
```bash
aws acm request-certificate \
  --domain-name api.example.com \
  --subject-alternative-names '*.api.example.com' \
  --validation-method DNS \
  --region us-east-1
```

2. **Add DNS Validation Records:**
```bash
# Get validation records
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT_ID

# Add CNAME records to Route 53 or your DNS provider
```

3. **Attach to Load Balancer:**
```bash
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:ACCOUNT:loadbalancer/app/sim-corp-lb/... \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT_ID \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:ACCOUNT:targetgroup/...
```

**Note:** ACM certificates are automatically renewed by AWS. Services run HTTP internally, and the load balancer handles TLS termination.

## mTLS (Mutual TLS) Configuration

mTLS provides mutual authentication between services.

### Server-Side (Require Client Certificates)

```typescript
import { TlsFactory } from '@sim-corp/tls';

const manager = TlsFactory.createManager({
  enabled: true,
  provider: 'self-signed',
  requireClientCert: true // Enable mTLS
});

await manager.initialize({
  serverCommonName: 'api.internal',
  clientCommonName: 'client.internal'
});

// Get server config (includes requestCert: true)
const serverConfig = await manager.getServerConfig();
// serverConfig.requestCert = true
// serverConfig.rejectUnauthorized = true
```

### Client-Side (Send Client Certificate)

```typescript
import https from 'node:https';
import { TlsFactory } from '@sim-corp/tls';

const manager = TlsFactory.createManager({
  enabled: true,
  provider: 'self-signed',
  requireClientCert: true
});

await manager.initialize({
  serverCommonName: 'api.internal',
  clientCommonName: 'service-a.internal'
});

// Get client config
const clientConfig = await manager.getClientConfig();

// Make HTTPS request with client certificate
const options = {
  hostname: 'api.internal',
  port: 443,
  path: '/health',
  method: 'GET',
  key: clientConfig?.key,
  cert: clientConfig?.cert,
  ca: clientConfig?.ca
};

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
});

req.end();
```

### Service Mesh mTLS (Istio/Linkerd)

For production, use a service mesh for automatic mTLS:

**Istio Example:**

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: sim-corp
spec:
  mtls:
    mode: STRICT
```

Istio automatically:
- Generates certificates for each service
- Rotates certificates before expiry
- Enforces mTLS between all services
- Provides telemetry and observability

## Certificate Rotation

### Automatic Rotation

```typescript
import { TlsFactory } from '@sim-corp/tls';

const manager = TlsFactory.createManager({
  enabled: true,
  provider: 'self-signed',
  autoRenew: true,
  renewalThresholdDays: 30 // Renew 30 days before expiry
});

await manager.initialize({
  serverCommonName: 'localhost'
});

// Start automatic renewal checker (runs daily)
const renewalInterval = manager.startRenewalChecker(24 * 60 * 60 * 1000);

// Register callback for rotation events
manager.onRotation(async (event) => {
  console.log('Certificate rotated:', event);
  // Implement graceful restart logic here
});
```

### Manual Rotation

```typescript
// Check if renewal is needed
const needsRenewal = await manager.renewIfNeeded('localhost');

if (needsRenewal) {
  console.log('Certificate renewed successfully');
  // Graceful restart required
  process.kill(process.pid, 'SIGTERM');
}
```

### Graceful Restart After Rotation

```typescript
import Fastify from 'fastify';
import { TlsFactory, FastifyTlsHelper } from '@sim-corp/tls';

const manager = TlsFactory.getInstance();

// Register rotation hook
manager.onRotation(async (event) => {
  console.log('Certificate rotated - scheduling graceful restart');

  // Wait for current requests to complete
  setTimeout(async () => {
    await app.close();
    process.exit(0); // Let process manager (PM2, systemd) restart
  }, 5000);
});
```

## Certificate Validation

```typescript
// Get certificate
const cert = await manager.getCertificate('localhost');

// Validate certificate
const validation = await manager.validateCertificate(cert!);

if (!validation.valid) {
  console.error('Certificate invalid:', validation.reason);
} else {
  console.log(`Certificate valid, expires in ${validation.expiresInDays} days`);

  if (validation.expiresInDays! < 30) {
    console.warn('Certificate expires soon - renewal recommended');
  }
}
```

## Production Deployment Strategies

### Strategy 1: TLS Termination at Load Balancer (Recommended)

**Architecture:**
- Load balancer handles TLS (Let's Encrypt/ACM)
- Services run HTTP internally
- No certificate management in application code

**Pros:**
- Simplest application code
- Centralized certificate management
- Better performance (TLS offloading)

**Cons:**
- No mTLS between services
- Internal traffic unencrypted

**Use Case:** Public-facing APIs, most production deployments

### Strategy 2: Service Mesh mTLS (Istio/Linkerd)

**Architecture:**
- Load balancer handles ingress TLS
- Service mesh provides mTLS between services
- Automatic certificate rotation

**Pros:**
- End-to-end encryption
- Zero-trust security model
- Automatic certificate management
- Observability built-in

**Cons:**
- Additional infrastructure complexity
- Performance overhead
- Learning curve

**Use Case:** High-security requirements, microservices at scale

### Strategy 3: Application-Level TLS

**Architecture:**
- Each service manages its own TLS
- Uses `@sim-corp/tls` library
- Let's Encrypt or self-signed certificates

**Pros:**
- Full control over TLS configuration
- Works without additional infrastructure
- Simple for small deployments

**Cons:**
- Each service needs certificate management
- Manual certificate rotation
- More application complexity

**Use Case:** Small deployments, edge computing, air-gapped environments

## Security Best Practices

### 1. Use Strong Cipher Suites

```typescript
const httpsOptions = {
  ...await FastifyTlsHelper.getHttpsOptions(tlsManager),
  ciphers: [
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384'
  ].join(':'),
  honorCipherOrder: true,
  minVersion: 'TLSv1.2'
};
```

### 2. Enable HTTP Strict Transport Security (HSTS)

```typescript
app.addHook('onRequest', async (request, reply) => {
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
});
```

### 3. Rotate Certificates Regularly

```bash
# Set short validity for internal certificates
export TLS_RENEWAL_THRESHOLD_DAYS=7

# For production, aim for:
# - 90 days validity (Let's Encrypt default)
# - 30 days renewal threshold
# - Automated rotation
```

### 4. Monitor Certificate Expiry

```typescript
setInterval(async () => {
  const cert = await manager.getCertificate('localhost');
  if (cert) {
    const validation = await manager.validateCertificate(cert);
    if (validation.expiresInDays! < 14) {
      // Alert via monitoring system
      console.error('Certificate expires in', validation.expiresInDays, 'days!');
    }
  }
}, 24 * 60 * 60 * 1000); // Check daily
```

### 5. Use Different Certificates per Environment

```bash
# Development
export TLS_PROVIDER=self-signed

# Staging
export TLS_PROVIDER=file
export TLS_CERT_PATH=/etc/certs/staging/server.crt

# Production
export TLS_PROVIDER=file
export TLS_CERT_PATH=/etc/certs/production/server.crt
```

## Troubleshooting

### Error: "self signed certificate"

**Cause:** Client doesn't trust self-signed certificate

**Solution (Development):**
```bash
# Node.js
export NODE_TLS_REJECT_UNAUTHORIZED=0

# curl
curl --insecure https://localhost:3000

# Browser: Click "Advanced" → "Proceed to localhost"
```

**Solution (Production):** Use Let's Encrypt or ACM certificates

### Error: "certificate has expired"

**Cause:** Certificate past expiry date

**Solution:**
```bash
# Check expiry
openssl x509 -in server.crt -noout -enddate

# Renew certificate
certbot renew

# Or regenerate
await manager.renewIfNeeded('localhost');
```

### Error: "unable to verify the first certificate"

**Cause:** Missing CA certificate chain

**Solution:**
```bash
# Include full chain in certificate file
cat server.crt intermediate.crt root.crt > fullchain.crt

# Or set CA in code
const serverConfig = {
  ...await manager.getServerConfig(),
  ca: fs.readFileSync('/etc/certs/ca.crt')
};
```

### Error: "certificate verify failed"

**Cause:** Certificate doesn't match hostname

**Solution:**
```bash
# Check certificate SANs
openssl x509 -in server.crt -noout -text | grep DNS

# Generate certificate with correct altNames
await provider.generate({
  commonName: 'api.example.com',
  altNames: ['api.example.com', '*.api.example.com', 'localhost']
});
```

## Cost Considerations

### Let's Encrypt (Free)
- **Cost:** $0
- **Limits:** 50 certificates per domain per week
- **Validity:** 90 days
- **Auto-renewal:** Yes (with certbot)

### AWS Certificate Manager (ACM)
- **Cost:** $0 for public certificates
- **Cost:** $0.75/month for private certificates
- **Validity:** 13 months (auto-renewed)
- **Management:** Fully managed by AWS

### Commercial CA (DigiCert, GlobalSign)
- **Cost:** $200-$1000/year per certificate
- **Validity:** 1-2 years
- **Support:** Enterprise support included
- **Extended Validation:** Available

## Testing

### Test TLS Connection

```bash
# OpenSSL
openssl s_client -connect localhost:3000 -showcerts

# curl with verbose output
curl -vvv https://localhost:3000/health

# Test cipher suites
nmap --script ssl-enum-ciphers -p 3000 localhost
```

### Test mTLS

```bash
# Without client certificate (should fail)
curl https://localhost:3000/health

# With client certificate
curl --key client.key --cert client.crt --cacert ca.crt https://localhost:3000/health
```

### Test Certificate Validation

```typescript
import { describe, it, expect } from 'vitest';
import { TlsFactory } from '@sim-corp/tls';

describe('Certificate Validation', () => {
  it('should validate certificate expiry', async () => {
    const manager = TlsFactory.createManager({
      enabled: true,
      provider: 'self-signed'
    });

    await manager.initialize({ serverCommonName: 'localhost' });

    const cert = await manager.getCertificate('localhost');
    const validation = await manager.validateCertificate(cert!);

    expect(validation.valid).toBe(true);
    expect(validation.expiresInDays).toBeGreaterThan(0);
  });
});
```

## Next Steps

1. **Choose deployment strategy** based on requirements (load balancer, service mesh, or application-level)
2. **Set up certificate provider** (Let's Encrypt for staging, ACM for production)
3. **Enable TLS on services** using `@sim-corp/tls` library
4. **Configure mTLS** if required for service-to-service communication
5. **Set up monitoring** for certificate expiry and rotation
6. **Test thoroughly** in staging before production deployment

## Related Documentation

- [Secrets Management](./secrets-management.md) - Secure storage for TLS private keys
- [HSM Setup](./hsm-setup.md) - Hardware security for device identity
- [Monitoring Setup](../infra/monitoring.md) - Certificate expiry alerts
- [Security Architecture](../architecture/security.md) - Overall security design
