import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { getEnvelopeSigningBytes } from "@sim-corp/schemas";
import type { TelemetryEnvelope } from "@sim-corp/schemas";

type SigningMode = "off" | "ed25519";

interface SignerOptions {
  mode?: string;
  kid?: string;
  privateKeyB64?: string;
  defaultKid: string;
  orgId: string;
  kernelUrl?: string;
  autoRegister?: boolean;
  logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };
}

export interface EnvelopeSigner {
  signEnvelope(envelope: TelemetryEnvelope, overrideKid?: string): TelemetryEnvelope;
  ensureRegistered(overrideKid?: string): Promise<void>;
}

const registeredKids = new Set<string>();

export function createEnvelopeSigner(options: SignerOptions): EnvelopeSigner {
  const mode = normalizeMode(options.mode);
  if (mode === "off") {
    return {
      signEnvelope: (envelope) => envelope,
      ensureRegistered: async () => undefined
    };
  }

  const allowAutoGenerate = process.env.NODE_ENV !== "production";
  let kid = options.kid ?? options.defaultKid;
  let privateKeyB64 = options.privateKeyB64;
  let publicKeyB64: string | undefined;

  if ((!kid || !privateKeyB64) && allowAutoGenerate) {
    const pair = generateKeyPairSync("ed25519");
    privateKeyB64 = pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    publicKeyB64 = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
    kid = kid ?? options.defaultKid;
    options.logger?.info?.("event-inference: generated signing key", { kid, publicKeyB64 });
  }

  if (!kid || !privateKeyB64) {
    throw new Error("SIGNING_KID and SIGNING_PRIVATE_KEY_B64 are required for signing");
  }

  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyB64, "base64"),
    format: "der",
    type: "pkcs8"
  });
  if (!publicKeyB64) {
    const publicKey = createPublicKey(privateKey);
    publicKeyB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  }

  const autoRegister = options.autoRegister ?? (process.env.SIGNING_AUTO_REGISTER ?? "true") !== "false";
  const kernelUrl = options.kernelUrl ?? process.env.KERNEL_URL;

  const ensureRegistered = async (overrideKid?: string): Promise<void> => {
    const resolvedKid = overrideKid ?? kid;
    if (!autoRegister || !kernelUrl || registeredKids.has(resolvedKid)) {
      return;
    }
    try {
      const response = await fetch(`${kernelUrl.replace(/\/$/, "")}/devices`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kid: resolvedKid,
          orgId: options.orgId,
          publicKeyB64,
          meta: { source: "event-inference" }
        })
      });
      if (!response.ok && response.status !== 409) {
        options.logger?.warn?.("event-inference: failed to register device key", response.status);
        return;
      }
      registeredKids.add(resolvedKid);
    } catch (error) {
      options.logger?.warn?.("event-inference: device key registration error", error);
    }
  };

  const signEnvelope = (envelope: TelemetryEnvelope, overrideKid?: string): TelemetryEnvelope => {
    const resolvedKid = overrideKid ?? kid;
    const payload = { ...envelope, kid: resolvedKid };
    const bytes = getEnvelopeSigningBytes(payload);
    const signature = sign(null, bytes, privateKey).toString("base64");
    return { ...payload, sig: signature };
  };

  return { signEnvelope, ensureRegistered };
}

function normalizeMode(value?: string): SigningMode {
  const mode = (value ?? "ed25519").toLowerCase();
  if (mode === "off") return "off";
  return "ed25519";
}
