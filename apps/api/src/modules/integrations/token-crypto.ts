import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../../env";

const VERSION = "v1";
const IV_BYTES = 12;
const KEY = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");

export function encryptToken(plainText: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${VERSION}:${iv.toString("base64")}:${encrypted.toString("base64")}:${authTag.toString("base64")}`;
}

export function decryptToken(encoded: string): string {
  const [version, ivBase64, cipherBase64, tagBase64] = encoded.split(":");
  if (version !== VERSION || !ivBase64 || !cipherBase64 || !tagBase64) {
    throw new Error("Invalid encrypted token format.");
  }

  const iv = Buffer.from(ivBase64, "base64");
  const cipherText = Buffer.from(cipherBase64, "base64");
  const authTag = Buffer.from(tagBase64, "base64");

  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return decrypted.toString("utf8");
}
