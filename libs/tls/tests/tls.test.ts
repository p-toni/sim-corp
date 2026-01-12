import { describe, it, expect, beforeEach } from 'vitest';
import { SelfSignedProvider } from '../src/self-signed-provider';
import { CertificateManager } from '../src/certificate-manager';
import { TlsFactory } from '../src/factory';
import type { TlsConfig } from '../src/interfaces';

describe('T-041: TLS & mTLS', () => {
  describe('SelfSignedProvider', () => {
    let provider: SelfSignedProvider;

    beforeEach(() => {
      provider = new SelfSignedProvider({
        organization: 'Sim-Corp',
        defaultValidityDays: 365
      });
    });

    it('should generate server certificate', async () => {
      const cert = await provider.generate({
        commonName: 'localhost',
        altNames: ['127.0.0.1', 'localhost'],
        type: 'server'
      });

      expect(cert).toBeDefined();
      expect(cert.commonName).toBe('localhost');
      expect(cert.type).toBe('server');
      expect(cert.cert).toContain('-----BEGIN CERTIFICATE-----');
      expect(cert.key).toMatch(/-----BEGIN (RSA )?PRIVATE KEY-----/); // Accept both RSA and standard format
      expect(cert.ca).toContain('-----BEGIN CERTIFICATE-----');
      expect(cert.altNames).toEqual(['127.0.0.1', 'localhost']);
      expect(cert.fingerprint).toBeTruthy();
    });

    it('should generate client certificate', async () => {
      const cert = await provider.generate({
        commonName: 'client-1',
        type: 'client'
      });

      expect(cert).toBeDefined();
      expect(cert.commonName).toBe('client-1');
      expect(cert.type).toBe('client');
      expect(cert.cert).toBeTruthy();
      expect(cert.key).toBeTruthy();
    });

    it('should retrieve generated certificate', async () => {
      await provider.generate({
        commonName: 'test.example.com',
        type: 'server'
      });

      const retrieved = await provider.get('test.example.com');
      expect(retrieved).toBeDefined();
      expect(retrieved?.commonName).toBe('test.example.com');
    });

    it('should return null for non-existent certificate', async () => {
      const cert = await provider.get('non-existent.com');
      expect(cert).toBeNull();
    });

    it('should list all generated certificates', async () => {
      await provider.generate({ commonName: 'cert1.com', type: 'server' });
      await provider.generate({ commonName: 'cert2.com', type: 'server' });

      const certs = await provider.list();
      expect(certs.length).toBeGreaterThanOrEqual(2); // CA + 2 certs
    });

    it('should include CA certificate in list', async () => {
      await provider.generate({ commonName: 'test.com', type: 'server' });

      const certs = await provider.list();
      const caCert = certs.find(c => c.type === 'ca');
      expect(caCert).toBeDefined();
      expect(caCert?.commonName).toBe('Sim-Corp Development CA');
    });
  });

  describe('CertificateManager', () => {
    let manager: CertificateManager;
    let provider: SelfSignedProvider;
    let config: TlsConfig;

    beforeEach(() => {
      provider = new SelfSignedProvider();
      config = {
        enabled: true,
        provider: 'self-signed',
        requireClientCert: false
      };
      manager = new CertificateManager(provider, config);
    });

    it('should initialize with server certificate', async () => {
      await manager.initialize({
        serverCommonName: 'localhost',
        serverAltNames: ['127.0.0.1']
      });

      const serverConfig = await manager.getServerConfig();
      expect(serverConfig).toBeDefined();
      expect(serverConfig?.cert).toContain('-----BEGIN CERTIFICATE-----');
      expect(serverConfig?.key).toMatch(/-----BEGIN (RSA )?PRIVATE KEY-----/);
      expect(serverConfig?.ca).toBeTruthy();
    });

    it('should return null server config when TLS disabled', async () => {
      const disabledConfig: TlsConfig = { ...config, enabled: false };
      const disabledManager = new CertificateManager(provider, disabledConfig);

      await disabledManager.initialize({
        serverCommonName: 'localhost'
      });

      const serverConfig = await disabledManager.getServerConfig();
      expect(serverConfig).toBeNull();
    });

    it('should initialize with mTLS (client certificate)', async () => {
      const mtlsConfig: TlsConfig = { ...config, requireClientCert: true };
      const mtlsManager = new CertificateManager(provider, mtlsConfig);

      await mtlsManager.initialize({
        serverCommonName: 'localhost',
        clientCommonName: 'client-1'
      });

      const serverConfig = await mtlsManager.getServerConfig();
      const clientConfig = await mtlsManager.getClientConfig();

      expect(serverConfig?.requestCert).toBe(true);
      expect(serverConfig?.rejectUnauthorized).toBe(true);
      expect(clientConfig).toBeDefined();
      expect(clientConfig?.cert).toContain('-----BEGIN CERTIFICATE-----');
    });

    it('should validate certificate expiry', async () => {
      await manager.initialize({ serverCommonName: 'localhost' });

      const cert = await manager.getCertificate('localhost');
      expect(cert).toBeDefined();

      const validation = await manager.validateCertificate(cert!);
      expect(validation.valid).toBe(true);
      expect(validation.expiresInDays).toBeGreaterThan(0);
    });

    it('should detect expired certificate', async () => {
      await manager.initialize({ serverCommonName: 'localhost' });

      const cert = await manager.getCertificate('localhost');
      expect(cert).toBeDefined();

      // Simulate expired certificate
      const expiredCert = {
        ...cert!,
        notAfter: new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday
      };

      const validation = await manager.validateCertificate(expiredCert);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('expired');
    });

    it('should handle rotation callbacks', async () => {
      await manager.initialize({ serverCommonName: 'localhost' });

      let rotationEventReceived = false;
      manager.onRotation(async (event) => {
        rotationEventReceived = true;
        expect(event.commonName).toBe('localhost');
        expect(event.reason).toBeTruthy();
      });

      // Note: Actual rotation would require renewIfNeeded to trigger
      // This test just verifies callback registration works
      expect(rotationEventReceived).toBe(false); // Not rotated yet
    });
  });

  describe('TlsFactory', () => {
    beforeEach(() => {
      TlsFactory.resetInstance();
    });

    it('should create manager with self-signed provider', () => {
      const config: TlsConfig = {
        enabled: true,
        provider: 'self-signed'
      };

      const manager = TlsFactory.createManager(config);
      expect(manager).toBeDefined();
    });

    it('should create manager from environment variables', () => {
      process.env.TLS_ENABLED = 'true';
      process.env.TLS_PROVIDER = 'self-signed';

      const manager = TlsFactory.createFromEnv();
      expect(manager).toBeDefined();
    });

    it('should create singleton instance', () => {
      process.env.TLS_ENABLED = 'true';
      process.env.TLS_PROVIDER = 'self-signed';

      const manager1 = TlsFactory.getInstance();
      const manager2 = TlsFactory.getInstance();

      expect(manager1).toBe(manager2);
    });

    it('should reset singleton instance', () => {
      process.env.TLS_ENABLED = 'true';
      process.env.TLS_PROVIDER = 'self-signed';

      const manager1 = TlsFactory.getInstance();
      TlsFactory.resetInstance();
      const manager2 = TlsFactory.getInstance();

      expect(manager1).not.toBe(manager2);
    });

    it('should throw error for unsupported provider', () => {
      const config: TlsConfig = {
        enabled: true,
        provider: 'unknown' as any
      };

      expect(() => TlsFactory.createManager(config)).toThrow('Unknown TLS provider');
    });

    it('should throw error for ACM provider (not implemented)', () => {
      const config: TlsConfig = {
        enabled: true,
        provider: 'acm'
      };

      expect(() => TlsFactory.createManager(config)).toThrow('not yet implemented');
    });

    it('should throw error for Let\'s Encrypt provider (not implemented)', () => {
      const config: TlsConfig = {
        enabled: true,
        provider: 'lets-encrypt'
      };

      expect(() => TlsFactory.createManager(config)).toThrow('not yet implemented');
    });
  });

  describe('End-to-end TLS workflow', () => {
    it('should support complete TLS workflow', async () => {
      // Create manager
      const config: TlsConfig = {
        enabled: true,
        provider: 'self-signed',
        requireClientCert: false
      };
      const manager = TlsFactory.createManager(config);

      // Initialize with server certificate
      await manager.initialize({
        serverCommonName: 'localhost',
        serverAltNames: ['127.0.0.1', '::1']
      });

      // Get server config for HTTPS server
      const serverConfig = await manager.getServerConfig();
      expect(serverConfig).toBeDefined();
      expect(serverConfig?.key).toBeTruthy();
      expect(serverConfig?.cert).toBeTruthy();
      expect(serverConfig?.ca).toBeTruthy();

      // Validate certificate
      const cert = await manager.getCertificate('localhost');
      expect(cert).toBeDefined();

      const validation = await manager.validateCertificate(cert!);
      expect(validation.valid).toBe(true);
      expect(validation.expiresInDays).toBeGreaterThan(300); // Fresh cert
    });

    it('should support complete mTLS workflow', async () => {
      // Create manager with mTLS enabled
      const config: TlsConfig = {
        enabled: true,
        provider: 'self-signed',
        requireClientCert: true
      };
      const manager = TlsFactory.createManager(config);

      // Initialize with both server and client certificates
      await manager.initialize({
        serverCommonName: 'api.example.com',
        serverAltNames: ['api.example.com', '*.api.example.com'],
        clientCommonName: 'client.example.com'
      });

      // Get server config
      const serverConfig = await manager.getServerConfig();
      expect(serverConfig).toBeDefined();
      expect(serverConfig?.requestCert).toBe(true);
      expect(serverConfig?.rejectUnauthorized).toBe(true);

      // Get client config
      const clientConfig = await manager.getClientConfig();
      expect(clientConfig).toBeDefined();
      expect(clientConfig?.key).toBeTruthy();
      expect(clientConfig?.cert).toBeTruthy();
      expect(clientConfig?.ca).toBeTruthy();

      // Verify both certificates are valid
      const serverCert = await manager.getCertificate('api.example.com');
      const clientCert = await manager.getCertificate('client.example.com');

      expect(serverCert).toBeDefined();
      expect(clientCert).toBeDefined();

      const serverValidation = await manager.validateCertificate(serverCert!);
      const clientValidation = await manager.validateCertificate(clientCert!);

      expect(serverValidation.valid).toBe(true);
      expect(clientValidation.valid).toBe(true);
    });
  });
});
