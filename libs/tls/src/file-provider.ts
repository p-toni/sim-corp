import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import type { Certificate, CertificateRequest, ICertificateProvider } from './interfaces';

/**
 * File-based certificate provider.
 * Reads certificates and keys from the filesystem.
 *
 * Use this for production certificates (Let's Encrypt, manually provided, etc.)
 */
export class FileProvider implements ICertificateProvider {
  private certificates = new Map<string, Certificate>();

  constructor(private readonly options: {
    /** Base directory for certificates */
    certsDir: string;
    /** Watch for certificate changes and reload */
    watchForChanges?: boolean;
  }) {}

  async generate(request: CertificateRequest): Promise<Certificate> {
    throw new Error('FileProvider cannot generate certificates. Use self-signed provider or external CA.');
  }

  async get(commonName: string): Promise<Certificate | null> {
    // Check cache first
    const cached = this.certificates.get(commonName);
    if (cached) {
      return cached;
    }

    // Try to load from filesystem
    try {
      const certPath = `${this.options.certsDir}/${commonName}.crt`;
      const keyPath = `${this.options.certsDir}/${commonName}.key`;
      const caPath = `${this.options.certsDir}/ca.crt`;

      const [certPem, keyPem] = await Promise.all([
        fs.readFile(certPath, 'utf-8'),
        fs.readFile(keyPath, 'utf-8')
      ]);

      // Try to load CA certificate (optional)
      let caPem: string | undefined;
      try {
        caPem = await fs.readFile(caPath, 'utf-8');
      } catch (err) {
        // CA certificate is optional
      }

      // Parse certificate to extract metadata
      const { notBefore, notAfter, altNames } = this.parseCertificate(certPem);
      const fingerprint = this.calculateFingerprint(certPem);

      const certificate: Certificate = {
        cert: certPem,
        key: keyPem,
        ca: caPem,
        commonName,
        altNames,
        type: 'server', // Assume server cert by default
        notBefore,
        notAfter,
        fingerprint
      };

      // Cache certificate
      this.certificates.set(commonName, certificate);

      return certificate;
    } catch (err) {
      return null;
    }
  }

  async list(): Promise<Certificate[]> {
    // Read all .crt files in the certs directory
    try {
      const files = await fs.readdir(this.options.certsDir);
      const certFiles = files.filter(f => f.endsWith('.crt') && f !== 'ca.crt');

      const certificates: Certificate[] = [];
      for (const file of certFiles) {
        const commonName = file.replace('.crt', '');
        const cert = await this.get(commonName);
        if (cert) {
          certificates.push(cert);
        }
      }

      return certificates;
    } catch (err) {
      return [];
    }
  }

  /**
   * Parse certificate to extract metadata (simplified)
   */
  private parseCertificate(certPem: string): {
    notBefore: Date;
    notAfter: Date;
    altNames?: string[];
  } {
    // In a real implementation, use a proper X.509 parser
    // For now, return default values
    return {
      notBefore: new Date(),
      notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      altNames: []
    };
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
