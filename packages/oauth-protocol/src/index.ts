import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

const KEY_DERIVATION_INFO = Buffer.from("daymark-google-oauth-v1", "utf8");

export const ecPublicJwkSchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string().min(1),
  y: z.string().min(1),
});

export const ecPrivateJwkSchema = ecPublicJwkSchema.extend({
  d: z.string().min(1),
});

export const brokerEnvelopeSchema = z.object({
  version: z.literal(1),
  ephemeralPublicKey: ecPublicJwkSchema,
  salt: z.string().min(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
  authTag: z.string().min(1),
});

export const googleTokenPayloadSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresIn: z.number().int().positive().optional(),
  scope: z.string().optional(),
});

export type EcPublicJwk = z.infer<typeof ecPublicJwkSchema>;
export type EcPrivateJwk = z.infer<typeof ecPrivateJwkSchema>;
export type BrokerEnvelope = z.infer<typeof brokerEnvelopeSchema>;
export type GoogleTokenPayload = z.infer<typeof googleTokenPayloadSchema>;

export function generateApplianceKeyPair(): {
  publicKey: EcPublicJwk;
  privateKey: EcPrivateJwk;
} {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  return {
    publicKey: ecPublicJwkSchema.parse(publicKey.export({ format: "jwk" })),
    privateKey: ecPrivateJwkSchema.parse(privateKey.export({ format: "jwk" })),
  };
}

function deriveEncryptionKey(
  privateKey: EcPrivateJwk,
  publicKey: EcPublicJwk,
  salt: Buffer,
): Buffer {
  const sharedSecret = diffieHellman({
    privateKey: createPrivateKey({ key: privateKey, format: "jwk" }),
    publicKey: createPublicKey({ key: publicKey, format: "jwk" }),
  });
  return Buffer.from(
    hkdfSync("sha256", sharedSecret, salt, KEY_DERIVATION_INFO, 32),
  );
}

export function encryptForAppliance(
  appliancePublicKeyInput: EcPublicJwk,
  payloadInput: GoogleTokenPayload,
): BrokerEnvelope {
  const appliancePublicKey = ecPublicJwkSchema.parse(appliancePublicKeyInput);
  const payload = googleTokenPayloadSchema.parse(payloadInput);
  const ephemeral = generateApplianceKeyPair();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveEncryptionKey(
    ephemeral.privateKey,
    appliancePublicKey,
    salt,
  );
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    ephemeralPublicKey: ephemeral.publicKey,
    salt: salt.toString("base64url"),
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptBrokerEnvelope(
  appliancePrivateKeyInput: EcPrivateJwk,
  envelopeInput: BrokerEnvelope,
): GoogleTokenPayload {
  const appliancePrivateKey = ecPrivateJwkSchema.parse(
    appliancePrivateKeyInput,
  );
  const envelope = brokerEnvelopeSchema.parse(envelopeInput);
  const salt = Buffer.from(envelope.salt, "base64url");
  const iv = Buffer.from(envelope.iv, "base64url");
  const key = deriveEncryptionKey(
    appliancePrivateKey,
    envelope.ephemeralPublicKey,
    salt,
  );
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return googleTokenPayloadSchema.parse(JSON.parse(plaintext));
}
