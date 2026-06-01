import { z } from "zod";

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url(),
  API_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().min(1),
  SESSION_SECRET: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  CALENDAR_CACHE_FRESH_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  CALENDAR_CACHE_STALE_TTL_SECONDS: z.coerce.number().int().positive().default(86400)
});

export type AppEnv = z.infer<typeof baseEnvSchema>;

function assertTokenEncryptionKey(key: string): void {
  const decoded = Buffer.from(key, "base64");

  if (decoded.byteLength !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be base64-encoded and decode to exactly 32 bytes."
    );
  }
}

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv {
  const env = baseEnvSchema.parse(input);
  assertTokenEncryptionKey(env.TOKEN_ENCRYPTION_KEY);
  return env;
}
