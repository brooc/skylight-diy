import { describe, expect, it } from "vitest";
import {
  staticWeatherIconSource,
  weatherIconForCode,
} from "../src/features/weather/weatherIcons";

describe("weather icons", () => {
  it("uses separate partly-cloudy artwork for day and night", () => {
    const day = weatherIconForCode(2, true);
    const night = weatherIconForCode(2, false);

    expect(day.label).toBe("Partly cloudy");
    expect(night.label).toBe("Partly cloudy");
    expect(day.src).not.toBe(night.src);
    expect(day.src).toMatch(/^data:image\/svg\+xml,/);
    expect(night.src).toMatch(/^data:image\/svg\+xml,/);
  });

  it("removes perpetual SVG animation from dashboard icons", () => {
    const source = staticWeatherIconSource(
      '<svg><circle /><animateTransform repeatCount="indefinite"/></svg>',
    );

    expect(decodeURIComponent(source)).toBe(
      "data:image/svg+xml,<svg><circle /></svg>",
    );
  });

  it.each([
    [45, "Foggy"],
    [53, "Drizzle"],
    [63, "Rain"],
    [73, "Snow"],
    [95, "Thunderstorms"]
  ])("maps WMO code %s to %s", (code, label) => {
    expect(weatherIconForCode(code as number, true).label).toBe(label);
  });
});
