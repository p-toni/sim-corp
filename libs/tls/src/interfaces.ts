/**
 * TLS and certificate management interfaces
 */

export type CertificateType = 'ca' | 'server' | 'client';

export interface Certificate {
  /** Certificate in PEM format */
  cert: string;
  /** Private key in PEM format */
  key: string;
  /** Certificate Authority chain (if applicable) */
  ca?: string;
  /** Certificate serial number */
  serialNumber?: string;
  /** Subject Common Name */
  commonName: string;
  /** Subject Alternative Names */
  altNames?: string[];
  /** Certificate type */
  type: CertificateType;
  /** Certificate not valid before */
  notBefore: Date;
  /** Certificate not valid after */
  notAfter: Date;
  /** Fingerprint (SHA-256 hash) */
  fingerprint?: string;
}

export interface CertificateRequest {
  /** Common Name (CN) - required */
  commonName: string;
  /** Subject Alternative Names (DNS names or IPs) */
  altNames?: string[];
  /** Organization */
  organization?: string;
  /** Organizational Unit */
  organizationalUnit?: string;
  /** Country */
  country?: string;
  /** State/Province */
  state?: string;
  /** Locality/City */
  locality?: string;
  /** Certificate validity in days */
  validityDays?: number;
  /** Certificate type */
  type?: CertificateType;
}

export interface TlsConfig {
  /** Enable TLS */
  enabled: boolean;
  /** Certificate source: 'self-signed', 'file', 'acm', 'lets-encrypt' */
  provider: 'self-signed' | 'file' | 'acm' | 'lets-encrypt';
  /** Path to certificate file (for 'file' provider) */
  certPath?: string;
  /** Path to private key file (for 'file' provider) */
  keyPath?: string;
  /** Path to CA certificate file (for mTLS) */
  caPath?: string;
  /** Require client certificates (mTLS) */
  requireClientCert?: boolean;
  /** Certificate auto-renewal enabled */
  autoRenew?: boolean;
  /** Days before expiry to trigger renewal */
  renewalThresholdDays?: number;
  /** ACM certificate ARN (for AWS ACM provider) */
  acmCertArn?: string;
  /** Let's Encrypt configuration */
  letsEncrypt?: {
    email: string;
    staging: boolean;
  };
}

export interface ICertificateProvider {
  /**
   * Generate a new certificate
   */
  generate(request: CertificateRequest): Promise<Certificate>;

  /**
   * Get an existing certificate by common name
   */
  get(commonName: string): Promise<Certificate | null>;

  /**
   * Renew a certificate
   */
  renew?(commonName: string): Promise<Certificate>;

  /**
   * Revoke a certificate
   */
  revoke?(commonName: string): Promise<void>;

  /**
   * List all certificates
   */
  list?(): Promise<Certificate[]>;
}

export interface ICertificateManager {
  /**
   * Get TLS configuration for Fastify/Node.js HTTPS server
   */
  getServerConfig(): Promise<{
    key: string;
    cert: string;
    ca?: string;
    requestCert?: boolean;
    rejectUnauthorized?: boolean;
  } | null>;

  /**
   * Get TLS configuration for HTTP client (for mTLS)
   */
  getClientConfig(): Promise<{
    key: string;
    cert: string;
    ca?: string;
  } | null>;

  /**
   * Get certificate by common name
   */
  getCertificate(commonName: string): Promise<Certificate | null>;

  /**
   * Renew certificate if needed (based on expiry threshold)
   */
  renewIfNeeded(commonName: string): Promise<boolean>;

  /**
   * Validate certificate (check expiry, revocation, etc.)
   */
  validateCertificate(cert: Certificate): Promise<{
    valid: boolean;
    reason?: string;
    expiresInDays?: number;
  }>;
}

export interface CertificateRotationEvent {
  commonName: string;
  oldFingerprint?: string;
  newFingerprint: string;
  timestamp: string;
  reason: 'expiry' | 'manual' | 'revoked';
}

export type CertificateRotationCallback = (event: CertificateRotationEvent) => void | Promise<void>;
