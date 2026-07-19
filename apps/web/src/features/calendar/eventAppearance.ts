export function softenEventColor(color: string | undefined, fallback: string): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? `${color}30` : fallback;
}

export function eventBandBackground(colors: string[], fallback: string): string {
  const uniqueColors = Array.from(new Set(colors));
  if (uniqueColors.length === 0) return fallback;
  if (uniqueColors.length === 1) return uniqueColors[0] ?? fallback;

  const bandSize = 100 / uniqueColors.length;
  const stops = uniqueColors.flatMap((color, index) => [
    `${color} ${index * bandSize}%`,
    `${color} ${(index + 1) * bandSize}%`
  ]);
  return `linear-gradient(125deg, ${stops.join(", ")})`;
}
