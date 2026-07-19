import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, resetTestDb, setupHousehold, unlockAdmin } from "./helpers/test-app";

describe("weather route", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetTestDb(app);
    await setupHousehold(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("stays unconfigured until the household has coordinates", async () => {
    const response = await app.inject({ method: "GET", url: "/api/weather/current" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ configured: false });
  });

  it("returns current weather for the configured household location", async () => {
    const { cookie } = await unlockAdmin(app);
    const location = await app.inject({
      method: "PATCH",
      url: "/api/household/current",
      headers: { cookie },
      payload: {
        locationName: "Los Angeles",
        latitude: 34.0522,
        longitude: -118.2437
      }
    });
    expect(location.statusCode).toBe(200);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          current: { temperature_2m: 79.6, weather_code: 1, is_day: 1 },
          current_units: { temperature_2m: "°F" }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const response = await app.inject({ method: "GET", url: "/api/weather/current" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      configured: true,
      locationName: "Los Angeles",
      temperature: 80,
      temperatureUnit: "°F",
      weatherCode: 1,
      isDay: true
    });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("api.open-meteo.com/v1/forecast");
  });

  it("searches for cities while keeping coordinates internal", async () => {
    const { cookie } = await unlockAdmin(app);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 5368361,
              name: "Los Angeles",
              admin1: "California",
              country: "United States",
              latitude: 34.0522,
              longitude: -118.2437
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const response = await app.inject({
      method: "GET",
      url: "/api/weather/locations?query=Los%20Angeles",
      headers: { cookie }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().locations[0]).toEqual({
      id: 5368361,
      name: "Los Angeles",
      label: "Los Angeles, California, United States",
      latitude: 34.0522,
      longitude: -118.2437
    });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain(
      "geocoding-api.open-meteo.com/v1/search"
    );
  });
});
