import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
const SALT_BYTES = 16;
const KEY_BYTES = 32;

export function hashAdminPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(pin, salt, KEY_BYTES);
  return `${VERSION}:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyAdminPin(pin: string, encodedHash: string): boolean {
  const [version, saltBase64, hashBase64] = encodedHash.split(":");

  if (version !== VERSION || !saltBase64 || !hashBase64) {
    return false;
  }

  const salt = Buffer.from(saltBase64, "base64");
  const expected = Buffer.from(hashBase64, "base64");
  const actual = scryptSync(pin, salt, expected.byteLength);

  return timingSafeEqual(expected, actual);
}
