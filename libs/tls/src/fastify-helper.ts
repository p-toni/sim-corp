import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import type { ICertificateManager } from './interfaces';

/**
 * Helper functions for integrating TLS with Fastify services
 */
export class FastifyTlsHelper {
  /**
   * Get Fastify HTTPS options from certificate manager
   */
  static async getHttpsOptions(
    manager: ICertificateManager
  ): Promise<FastifyServerOptions['https'] | undefined> {
    const serverConfig = await manager.getServerConfig();
    if (!serverConfig) {
      return undefined;
    }

    return {
      key: serverConfig.key,
      cert: serverConfig.cert,
      ca: serverConfig.ca,
      requestCert: serverConfig.requestCert,
      rejectUnauthorized: serverConfig.rejectUnauthorized
    };
  }

  /**
   * Add certificate rotation hook to Fastify instance
   */
  static addRotationHook(
    app: FastifyInstance,
    manager: ICertificateManager
  ): void {
    manager.onRotation(async (event) => {
      app.log.info({
        commonName: event.commonName,
        oldFingerprint: event.oldFingerprint,
        newFingerprint: event.newFingerprint,
        reason: event.reason
      }, 'TLS certificate rotated');

      // Note: Fastify doesn't support hot-reloading TLS certificates
      // A graceful restart is required after rotation
      app.log.warn('Certificate rotated - graceful restart required for new certificate to take effect');
    });
  }

  /**
   * Create HTTP client options for mTLS
   */
  static async getHttpClientOptions(
    manager: ICertificateManager
  ): Promise<{
    key: string;
    cert: string;
    ca?: string;
  } | null> {
    return manager.getClientConfig();
  }
}
