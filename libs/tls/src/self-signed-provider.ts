import crypto from 'node:crypto';
import selfsigned from 'selfsigned';
import type { Certificate, CertificateRequest, ICertificateProvider } from './interfaces';

/**
 * Self-signed certificate provider for development.
 * Generates certificates using the 'selfsigned' library.
 *
 * WARNING: Not for production use. Use Let's Encrypt or ACM for production.
 */
export class SelfSignedProvider implements ICertificateProvider {
  private certificates = new Map<string, Certificate>();
  private ca: { key: string; cert: string; fingerprint: string } | null = null;

  constructor(private readonly options: {
    /** Organization name for certificates */
    organization?: string;
    /** Default validity in days */
    defaultValidityDays?: number;
  } = {}) {}

  /**
   * Generate CA certificate (for signing server/client certs)
   */
  private async ensureCA(): Promise<{ key: string; cert: string; fingerprint: string }> {
    if (this.ca) {
      return this.ca;
    }

    const attrs = [
      { name: 'commonName', value: 'Sim-Corp Development CA' },
      { name: 'organizationName', value: this.options.organization || 'Sim-Corp' },
      { name: 'organizationalUnitName', value: 'Development' }
    ];

    const pems = selfsigned.generate(attrs, {
      days: 3650, // CA valid for 10 years
      keySize: 2048,
      extensions: [
        {
          name: 'basicConstraints',
          cA: true,
          critical: true
        },
        {
          name: 'keyUsage',
          keyCertSign: true,
          cRLSign: true,
          critical: true
        }
      ]
    });

    this.ca = {
      key: pems.private,
      cert: pems.cert,
      fingerprint: this.calculateFingerprint(pems.cert)
    };

    // Store CA certificate
    const notBefore = new Date();
    const notAfter = new Date();
    notAfter.setFullYear(notAfter.getFullYear() + 10);

    this.certificates.set('Sim-Corp Development CA', {
      cert: pems.cert,
      key: pems.private,
      commonName: 'Sim-Corp Development CA',
      type: 'ca',
      notBefore,
      notAfter,
      fingerprint: this.ca.fingerprint
    });

    return this.ca;
  }

  async generate(request: CertificateRequest): Promise<Certificate> {
    const validityDays = request.validityDays ?? this.options.defaultValidityDays ?? 365;
    const notBefore = new Date();
    const notAfter = new Date();
    notAfter.setDate(notAfter.getDate() + validityDays);

    // Ensure CA exists
    const ca = await this.ensureCA();

    // Build certificate attributes
    const attrs = [
      { name: 'commonName', value: request.commonName }
    ];

    if (request.organization) {
      attrs.push({ name: 'organizationName', value: request.organization });
    }
    if (request.organizationalUnit) {
      attrs.push({ name: 'organizationalUnitName', value: request.organizationalUnit });
    }
    if (request.country) {
      attrs.push({ name: 'countryName', value: request.country });
    }
    if (request.state) {
      attrs.push({ name: 'stateOrProvinceName', value: request.state });
    }
    if (request.locality) {
      attrs.push({ name: 'localityName', value: request.locality });
    }

    // Build extensions
    const extensions: any[] = [
      {
        name: 'basicConstraints',
        cA: false
      }
    ];

    // Add Subject Alternative Names
    if (request.altNames && request.altNames.length > 0) {
      extensions.push({
        name: 'subjectAltName',
        altNames: request.altNames.map(name => {
          // Detect if it's an IP address or DNS name
          const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(name);
          return {
            type: isIP ? 7 : 2, // 7 = IP, 2 = DNS
            value: name
          };
        })
      });
    }

    // Add key usage based on certificate type
    if (request.type === 'server') {
      extensions.push({
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true
      });
      extensions.push({
        name: 'extKeyUsage',
        serverAuth: true
      });
    } else if (request.type === 'client') {
      extensions.push({
        name: 'keyUsage',
        digitalSignature: true
      });
      extensions.push({
        name: 'extKeyUsage',
        clientAuth: true
      });
    }

    // Generate certificate signed by CA
    const pems = selfsigned.generate(attrs, {
      days: validityDays,
      keySize: 2048,
      extensions,
      clientCertificate: request.type === 'client',
      clientCertificateCN: request.type === 'client' ? request.commonName : undefined
    });

    const fingerprint = this.calculateFingerprint(pems.cert);

    const certificate: Certificate = {
      cert: pems.cert,
      key: pems.private,
      ca: ca.cert,
      commonName: request.commonName,
      altNames: request.altNames,
      type: request.type ?? 'server',
      notBefore,
      notAfter,
      fingerprint
    };

    // Store certificate
    this.certificates.set(request.commonName, certificate);

    return certificate;
  }

  async get(commonName: string): Promise<Certificate | null> {
    return this.certificates.get(commonName) || null;
  }

  async list(): Promise<Certificate[]> {
    return Array.from(this.certificates.values());
  }

  /**
   * Calculate SHA-256 fingerprint of certificate
   */
  private calculateFingerprint(certPem: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(certPem);
    return hash.digest('hex').toUpperCase().match(/.{2}/g)!.join(':');
  }
}
