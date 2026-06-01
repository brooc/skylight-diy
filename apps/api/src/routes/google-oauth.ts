import type { FastifyPluginAsync } from "fastify";

export const googleOauthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/integrations/google/connect", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    return {
      available: false,
      message: "Google OAuth wiring will be added in the next implementation slice."
    };
  });

  app.get("/integrations/google/callback", async () => {
    return {
      connected: false,
      message: "Callback route scaffolded."
    };
  });
};
