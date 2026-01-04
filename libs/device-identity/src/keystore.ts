import fs from "node:fs/promises";
import path from "node:path";
import { generateDeviceKeypair, type DeviceKeypair } from "./keypair";

/**
 * Simple file-based keystore for device keypairs.
 * In production, this would be replaced with HSM or secure key storage.
 */
export class DeviceKeyStore {
  constructor(private readonly keystorePath: string) {}

  /**
   * Generates and stores a new device keypair.
   */
  async generateAndStore(kid: string): Promise<DeviceKeypair> {
    const keypair = await generateDeviceKeypair(kid);
    await this.store(keypair);
    return keypair;
  }

  /**
   * Stores a device keypair to disk.
   */
  async store(keypair: DeviceKeypair): Promise<void> {
    const keyDir = path.join(this.keystorePath, keypair.kid);
    await fs.mkdir(keyDir, { recursive: true });

    await Promise.all([
      fs.writeFile(path.join(keyDir, "public.pem"), keypair.publicKey, "utf-8"),
      fs.writeFile(path.join(keyDir, "private.pem"), keypair.privateKey, "utf-8"),
      fs.writeFile(path.join(keyDir, "public.jwk"), JSON.stringify(keypair.publicKeyJwk, null, 2), "utf-8"),
      fs.writeFile(path.join(keyDir, "private.jwk"), JSON.stringify(keypair.privateKeyJwk, null, 2), "utf-8"),
      fs.writeFile(path.join(keyDir, "kid.txt"), keypair.kid, "utf-8")
    ]);
  }

  /**
   * Loads a device keypair from disk.
   */
  async load(kid: string): Promise<DeviceKeypair | null> {
    const keyDir = path.join(this.keystorePath, kid);

    try {
      const [publicKey, privateKey, publicKeyJwk, privateKeyJwk] = await Promise.all([
        fs.readFile(path.join(keyDir, "public.pem"), "utf-8"),
        fs.readFile(path.join(keyDir, "private.pem"), "utf-8"),
        fs.readFile(path.join(keyDir, "public.jwk"), "utf-8").then(JSON.parse),
        fs.readFile(path.join(keyDir, "private.jwk"), "utf-8").then(JSON.parse)
      ]);

      return {
        kid,
        publicKey,
        privateKey,
        publicKeyJwk,
        privateKeyJwk
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  /**
   * Gets or creates a device keypair.
   */
  async getOrCreate(kid: string): Promise<DeviceKeypair> {
    const existing = await this.load(kid);
    if (existing) {
      return existing;
    }
    return this.generateAndStore(kid);
  }

  /**
   * Lists all stored key IDs.
   */
  async listKids(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.keystorePath, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }
}
