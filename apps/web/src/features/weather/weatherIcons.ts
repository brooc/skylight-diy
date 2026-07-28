import clearDaySvg from "@meteocons/svg/flat/clear-day.svg?raw";
import clearNightSvg from "@meteocons/svg/flat/clear-night.svg?raw";
import drizzleSvg from "@meteocons/svg/flat/drizzle.svg?raw";
import fogSvg from "@meteocons/svg/flat/fog.svg?raw";
import overcastSvg from "@meteocons/svg/flat/overcast.svg?raw";
import partlyCloudyDaySvg from "@meteocons/svg/flat/partly-cloudy-day.svg?raw";
import partlyCloudyNightSvg from "@meteocons/svg/flat/partly-cloudy-night.svg?raw";
import rainSvg from "@meteocons/svg/flat/rain.svg?raw";
import snowSvg from "@meteocons/svg/flat/snow.svg?raw";
import thunderstormsSvg from "@meteocons/svg/flat/thunderstorms.svg?raw";

export type WeatherIcon = {
  label: string;
  src: string;
};

export function staticWeatherIconSource(svg: string): string {
  const staticSvg = svg.replace(
    /<animate\w*\b[^>]*(?:\/>|>[\s\S]*?<\/animate\w*>)/g,
    "",
  );
  return `data:image/svg+xml,${encodeURIComponent(staticSvg)}`;
}

const clearDay = staticWeatherIconSource(clearDaySvg);
const clearNight = staticWeatherIconSource(clearNightSvg);
const drizzle = staticWeatherIconSource(drizzleSvg);
const fog = staticWeatherIconSource(fogSvg);
const overcast = staticWeatherIconSource(overcastSvg);
const partlyCloudyDay = staticWeatherIconSource(partlyCloudyDaySvg);
const partlyCloudyNight = staticWeatherIconSource(partlyCloudyNightSvg);
const rain = staticWeatherIconSource(rainSvg);
const snow = staticWeatherIconSource(snowSvg);
const thunderstorms = staticWeatherIconSource(thunderstormsSvg);

export function weatherIconForCode(code: number, isDay: boolean): WeatherIcon {
  if (code === 0) {
    return { label: isDay ? "Clear" : "Clear night", src: isDay ? clearDay : clearNight };
  }
  if (code === 1 || code === 2) {
    return {
      label: "Partly cloudy",
      src: isDay ? partlyCloudyDay : partlyCloudyNight
    };
  }
  if (code === 3) return { label: "Overcast", src: overcast };
  if (code === 45 || code === 48) return { label: "Foggy", src: fog };
  if (code >= 51 && code <= 57) return { label: "Drizzle", src: drizzle };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return { label: "Rain", src: rain };
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return { label: "Snow", src: snow };
  }
  if (code >= 95) return { label: "Thunderstorms", src: thunderstorms };
  return { label: "Cloudy", src: overcast };
}
