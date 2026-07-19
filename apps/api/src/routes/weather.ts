import { households } from "@daymark/db";
import type { FastifyPluginAsync } from "fastify";

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
  };
  current_units?: { temperature_2m?: string };
};

export const weatherRoutes: FastifyPluginAsync = async (app) => {
  app.get("/weather/current", async (_request, reply) => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) return reply.status(404).send({ error: "setup_not_completed" });
    if (household.latitude === null || household.longitude === null) {
      return { configured: false };
    }

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(household.latitude));
    url.searchParams.set("longitude", String(household.longitude));
    url.searchParams.set("current", "temperature_2m,weather_code,is_day");
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("timezone", "auto");

    try {
      const response = await fetch(url);
      if (!response.ok) return reply.status(502).send({ error: "weather_provider_failed" });
      const payload = (await response.json()) as OpenMeteoResponse;
      if (
        typeof payload.current?.temperature_2m !== "number" ||
        typeof payload.current.weather_code !== "number"
      ) {
        return reply.status(502).send({ error: "weather_provider_invalid_response" });
      }
      return {
        configured: true,
        locationName: household.locationName ?? "Home",
        temperature: Math.round(payload.current.temperature_2m),
        temperatureUnit: payload.current_units?.temperature_2m ?? "°F",
        weatherCode: payload.current.weather_code,
        isDay: payload.current.is_day !== 0
      };
    } catch {
      return reply.status(502).send({ error: "weather_provider_unavailable" });
    }
  });
};
