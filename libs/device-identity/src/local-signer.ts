import type { ISigner, AuditLogEntry } from "./interfaces";
import type { SignedPayload } from "./signing";
import { signTelemetry } from "./signing";
import type { IKeyStore } from "./interfaces";

/**
 * Local signer that uses private keys from file-based keystore.
 * For development and testing only - use HsmSigner for production.
 */
export class LocalSigner implements ISigner {
  private auditLog: AuditLogEntry[] = [];

  constructor(
    private readonly keystore: IKeyStore,
    private readonly enableAuditLogging: boolean = false
  ) {}

  async sign(payload: Record<string, unknown>, kid: string): Promise<SignedPayload> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    try {
      // Load keypair from keystore (will fail for HSM keystore)
      const keypair = await (this.keystore as any).load?.(kid);
      if (!keypair) {
        throw new Error(`Key not found: ${kid}`);
      }

      // Sign using private key
      const result = await signTelemetry(payload, keypair.privateKey, kid);
      success = true;
      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      if (this.enableAuditLogging) {
        this.auditLog.push({
          timestamp: new Date().toISOString(),
          operation: "SIGN",
          kid,
          success,
          error,
          metadata: {
            duration: Date.now() - startTime
          }
        });
      }
    }
  }

  async getAuditLog(): Promise<AuditLogEntry[]> {
    return [...this.auditLog];
  }
}
