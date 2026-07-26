import { z } from "zod";

const brokerEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3001),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  BROKER_STATE_SECRET: z.string().min(32),
});

export type BrokerEnv = z.infer<typeof brokerEnvSchema>;

export function parseBrokerEnv(input: NodeJS.ProcessEnv): BrokerEnv {
  return brokerEnvSchema.parse(input);
}
