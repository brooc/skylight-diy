import { households } from "@daymark/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
  };
  current_units?: { temperature_2m?: string };
};

type GeocodingResponse = {
  results?: Array<{
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    admin1?: string;
    country?: string;
  }>;
};

export const weatherRoutes: FastifyPluginAsync = async (app) => {
  app.get("/weather/locations", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    const parsed = z.object({ query: z.string().trim().min(2).max(120) }).safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_location_query" });

    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", parsed.data.query);
    url.searchParams.set("count", "5");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    try {
      const response = await fetch(url);
      if (!response.ok) return reply.status(502).send({ error: "location_provider_failed" });
      const payload = (await response.json()) as GeocodingResponse;
      return {
        locations: (payload.results ?? []).map((result) => ({
          id: result.id,
          name: result.name,
          displayName: [result.name, result.admin1].filter(Boolean).join(", "),
          label: [result.name, result.admin1, result.country].filter(Boolean).join(", "),
          latitude: result.latitude,
          longitude: result.longitude
        }))
      };
    } catch {
      return reply.status(502).send({ error: "location_provider_unavailable" });
    }
  });

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
