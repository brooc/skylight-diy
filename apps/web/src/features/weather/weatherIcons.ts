import clearDay from "@meteocons/svg/flat/clear-day.svg";
import clearNight from "@meteocons/svg/flat/clear-night.svg";
import drizzle from "@meteocons/svg/flat/drizzle.svg";
import fog from "@meteocons/svg/flat/fog.svg";
import overcast from "@meteocons/svg/flat/overcast.svg";
import partlyCloudyDay from "@meteocons/svg/flat/partly-cloudy-day.svg";
import partlyCloudyNight from "@meteocons/svg/flat/partly-cloudy-night.svg";
import rain from "@meteocons/svg/flat/rain.svg";
import snow from "@meteocons/svg/flat/snow.svg";
import thunderstorms from "@meteocons/svg/flat/thunderstorms.svg";

export type WeatherIcon = {
  label: string;
  src: string;
};

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
