import type {
  Certificate,
  CertificateRequest,
  ICertificateManager,
  ICertificateProvider,
  TlsConfig,
  CertificateRotationCallback,
  CertificateRotationEvent
} from './interfaces';

/**
 * Certificate manager for TLS/mTLS configuration.
 * Provides high-level API for managing certificates and TLS configuration.
 */
export class CertificateManager implements ICertificateManager {
  private serverCert: Certificate | null = null;
  private clientCert: Certificate | null = null;
  private rotationCallbacks: CertificateRotationCallback[] = [];

  constructor(
    private readonly provider: ICertificateProvider,
    private readonly config: TlsConfig
  ) {}

  /**
   * Initialize certificate manager (generate or load certificates)
   */
  async initialize(options: {
    serverCommonName: string;
    serverAltNames?: string[];
    clientCommonName?: string;
  }): Promise<void> {
    // Generate or load server certificate
    let serverCert = await this.provider.get(options.serverCommonName);
    if (!serverCert) {
      const request: CertificateRequest = {
        commonName: options.serverCommonName,
        altNames: options.serverAltNames,
        type: 'server',
        validityDays: 365
      };
      serverCert = await this.provider.generate(request);
    }
    this.serverCert = serverCert;

    // Generate or load client certificate if mTLS is enabled
    if (this.config.requireClientCert && options.clientCommonName) {
      let clientCert = await this.provider.get(options.clientCommonName);
      if (!clientCert) {
        const request: CertificateRequest = {
          commonName: options.clientCommonName,
          type: 'client',
          validityDays: 365
        };
        clientCert = await this.provider.generate(request);
      }
      this.clientCert = clientCert;
    }
  }

  async getServerConfig(): Promise<{
    key: string;
    cert: string;
    ca?: string;
    requestCert?: boolean;
    rejectUnauthorized?: boolean;
  } | null> {
    if (!this.config.enabled || !this.serverCert) {
      return null;
    }

    return {
      key: this.serverCert.key,
      cert: this.serverCert.cert,
      ca: this.serverCert.ca,
      requestCert: this.config.requireClientCert,
      rejectUnauthorized: this.config.requireClientCert
    };
  }

  async getClientConfig(): Promise<{
    key: string;
    cert: string;
    ca?: string;
  } | null> {
    if (!this.config.enabled || !this.clientCert) {
      return null;
    }

    return {
      key: this.clientCert.key,
      cert: this.clientCert.cert,
      ca: this.clientCert.ca
    };
  }

  async getCertificate(commonName: string): Promise<Certificate | null> {
    return this.provider.get(commonName);
  }

  async renewIfNeeded(commonName: string): Promise<boolean> {
    const cert = await this.provider.get(commonName);
    if (!cert) {
      return false;
    }

    const validation = await this.validateCertificate(cert);
    if (!validation.valid) {
      return false;
    }

    // Check if renewal is needed based on threshold
    const thresholdDays = this.config.renewalThresholdDays ?? 30;
    if (validation.expiresInDays !== undefined && validation.expiresInDays <= thresholdDays) {
      // Renew certificate
      if (this.provider.renew) {
        const newCert = await this.provider.renew(commonName);

        // Notify rotation callbacks
        const event: CertificateRotationEvent = {
          commonName,
          oldFingerprint: cert.fingerprint,
          newFingerprint: newCert.fingerprint,
          timestamp: new Date().toISOString(),
          reason: 'expiry'
        };
        await this.notifyRotation(event);

        // Update internal certificates
        if (this.serverCert?.commonName === commonName) {
          this.serverCert = newCert;
        }
        if (this.clientCert?.commonName === commonName) {
          this.clientCert = newCert;
        }

        return true;
      }
    }

    return false;
  }

  async validateCertificate(cert: Certificate): Promise<{
    valid: boolean;
    reason?: string;
    expiresInDays?: number;
  }> {
    const now = new Date();

    // Check if certificate is expired
    if (now > cert.notAfter) {
      return {
        valid: false,
        reason: 'Certificate has expired',
        expiresInDays: 0
      };
    }

    // Check if certificate is not yet valid
    if (now < cert.notBefore) {
      return {
        valid: false,
        reason: 'Certificate is not yet valid'
      };
    }

    // Calculate days until expiry
    const expiresInMs = cert.notAfter.getTime() - now.getTime();
    const expiresInDays = Math.floor(expiresInMs / (24 * 60 * 60 * 1000));

    return {
      valid: true,
      expiresInDays
    };
  }

  /**
   * Register callback for certificate rotation events
   */
  onRotation(callback: CertificateRotationCallback): void {
    this.rotationCallbacks.push(callback);
  }

  /**
   * Start automatic certificate renewal checker
   */
  startRenewalChecker(intervalMs: number = 24 * 60 * 60 * 1000): NodeJS.Timeout {
    return setInterval(async () => {
      if (this.serverCert) {
        await this.renewIfNeeded(this.serverCert.commonName);
      }
      if (this.clientCert) {
        await this.renewIfNeeded(this.clientCert.commonName);
      }
    }, intervalMs);
  }

  /**
   * Notify all rotation callbacks
   */
  private async notifyRotation(event: CertificateRotationEvent): Promise<void> {
    for (const callback of this.rotationCallbacks) {
      try {
        await callback(event);
      } catch (err) {
        console.error('Error in rotation callback:', err);
      }
    }
  }
}
