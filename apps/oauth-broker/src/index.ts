import { parseBrokerEnv } from "./env";
import { buildBrokerServer } from "./server";

const env = parseBrokerEnv(process.env);
const app = buildBrokerServer(env);

await app.listen({ host: env.HOST, port: env.PORT });
