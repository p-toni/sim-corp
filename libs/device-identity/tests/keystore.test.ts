import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DeviceKeyStore } from "../src/keystore";
import { generateDeviceKeypair } from "../src/keypair";

describe("DeviceKeyStore", () => {
  let keystorePath: string;
  let keystore: DeviceKeyStore;

  beforeEach(async () => {
    keystorePath = path.join(os.tmpdir(), `device-keystore-test-${Date.now()}`);
    keystore = new DeviceKeyStore(keystorePath);
  });

  afterEach(async () => {
    try {
      await fs.rm(keystorePath, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  it("generates and stores a new keypair", async () => {
    const kid = "device:test-machine@test-site";
    const keypair = await keystore.generateAndStore(kid);

    expect(keypair.kid).toBe(kid);

    const loaded = await keystore.load(kid);
    expect(loaded).toBeTruthy();
    expect(loaded?.kid).toBe(kid);
    expect(loaded?.publicKey).toBe(keypair.publicKey);
    expect(loaded?.privateKey).toBe(keypair.privateKey);
  });

  it("returns null for non-existent kid", async () => {
    const loaded = await keystore.load("device:non-existent@test-site");
    expect(loaded).toBeNull();
  });

  it("getOrCreate creates new keypair if not exists", async () => {
    const kid = "device:test-machine@test-site";
    const keypair = await keystore.getOrCreate(kid);

    expect(keypair.kid).toBe(kid);

    const loaded = await keystore.load(kid);
    expect(loaded?.publicKey).toBe(keypair.publicKey);
  });

  it("getOrCreate returns existing keypair if exists", async () => {
    const kid = "device:test-machine@test-site";
    const first = await keystore.getOrCreate(kid);
    const second = await keystore.getOrCreate(kid);

    expect(first.publicKey).toBe(second.publicKey);
    expect(first.privateKey).toBe(second.privateKey);
  });

  it("stores keypair manually", async () => {
    const kid = "device:manual@test-site";
    const keypair = await generateDeviceKeypair(kid);

    await keystore.store(keypair);

    const loaded = await keystore.load(kid);
    expect(loaded?.publicKey).toBe(keypair.publicKey);
    expect(loaded?.privateKey).toBe(keypair.privateKey);
  });

  it("lists all stored kids", async () => {
    await keystore.generateAndStore("device:machine-1@site-1");
    await keystore.generateAndStore("device:machine-2@site-1");
    await keystore.generateAndStore("device:machine-3@site-2");

    const kids = await keystore.listKids();
    expect(kids.sort()).toEqual([
      "device:machine-1@site-1",
      "device:machine-2@site-1",
      "device:machine-3@site-2"
    ].sort());
  });

  it("returns empty array when no keys exist", async () => {
    const kids = await keystore.listKids();
    expect(kids).toEqual([]);
  });
});
