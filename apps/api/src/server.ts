import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./env";
import { dbPlugin } from "./plugins/db";
import { sessionPlugin } from "./plugins/session";
import { calendarRoutes } from "./routes/calendar";
import { choresRoutes } from "./routes/chores";
import { googleOauthRoutes } from "./routes/google-oauth";
import { healthRoutes } from "./routes/health";
import { householdRoutes } from "./routes/household";
import { mealsRoutes } from "./routes/meals";
import { rewardsRoutes } from "./routes/rewards";
import { sessionRoutes } from "./routes/session";
import { setupRoutes } from "./routes/setup";
import { listsRoutes } from "./routes/lists";

export function buildServer() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "development" ? "info" : "warn"
    }
  });

  app.register(cors, {
    origin: env.APP_BASE_URL,
    credentials: true
  });
  app.register(dbPlugin);
  app.register(sessionPlugin);

  app.register(async (api) => {
    api.register(healthRoutes, { prefix: "/api" });
    api.register(setupRoutes, { prefix: "/api" });
    api.register(sessionRoutes, { prefix: "/api" });
    api.register(householdRoutes, { prefix: "/api" });
    api.register(choresRoutes, { prefix: "/api" });
    api.register(rewardsRoutes, { prefix: "/api" });
    api.register(mealsRoutes, { prefix: "/api" });
    api.register(listsRoutes, { prefix: "/api" });
    api.register(calendarRoutes, { prefix: "/api" });
    api.register(googleOauthRoutes, { prefix: "/api" });
  });

  return app;
}
