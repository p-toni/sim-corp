import { CertificateManager } from './certificate-manager';
import { SelfSignedProvider } from './self-signed-provider';
import { FileProvider } from './file-provider';
import type { TlsConfig, ICertificateProvider, ICertificateManager } from './interfaces';

/**
 * Factory for creating certificate managers based on configuration
 */
export class TlsFactory {
  /**
   * Create certificate manager from configuration
   */
  static createManager(config: TlsConfig): ICertificateManager {
    const provider = TlsFactory.createProvider(config);
    return new CertificateManager(provider, config);
  }

  /**
   * Create certificate provider based on configuration
   */
  static createProvider(config: TlsConfig): ICertificateProvider {
    switch (config.provider) {
      case 'self-signed':
        return new SelfSignedProvider({
          organization: 'Sim-Corp',
          defaultValidityDays: 365
        });

      case 'file':
        if (!config.certPath || !config.keyPath) {
          throw new Error('certPath and keyPath are required for file provider');
        }
        // Extract directory from certPath
        const certsDir = config.certPath.substring(0, config.certPath.lastIndexOf('/'));
        return new FileProvider({
          certsDir,
          watchForChanges: config.autoRenew
        });

      case 'acm':
        throw new Error('ACM provider not yet implemented. Use self-signed or file provider.');

      case 'lets-encrypt':
        throw new Error('Let\'s Encrypt provider not yet implemented. Use self-signed or file provider.');

      default:
        throw new Error(`Unknown TLS provider: ${config.provider}`);
    }
  }

  /**
   * Create certificate manager from environment variables
   */
  static createFromEnv(): ICertificateManager {
    const enabled = process.env.TLS_ENABLED === 'true';
    const provider = (process.env.TLS_PROVIDER as any) || 'self-signed';
    const requireClientCert = process.env.TLS_MTLS_ENABLED === 'true';

    const config: TlsConfig = {
      enabled,
      provider,
      certPath: process.env.TLS_CERT_PATH,
      keyPath: process.env.TLS_KEY_PATH,
      caPath: process.env.TLS_CA_PATH,
      requireClientCert,
      autoRenew: process.env.TLS_AUTO_RENEW === 'true',
      renewalThresholdDays: process.env.TLS_RENEWAL_THRESHOLD_DAYS
        ? parseInt(process.env.TLS_RENEWAL_THRESHOLD_DAYS, 10)
        : 30
    };

    return TlsFactory.createManager(config);
  }

  /**
   * Create singleton certificate manager instance
   */
  private static _instance: ICertificateManager | null = null;

  static getInstance(): ICertificateManager {
    if (!TlsFactory._instance) {
      TlsFactory._instance = TlsFactory.createFromEnv();
    }
    return TlsFactory._instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    TlsFactory._instance = null;
  }
}
