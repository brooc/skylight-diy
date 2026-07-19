export type FamilyMemberColor = {
  displayName: string;
  color: string;
};

export type MemberAppearance = {
  accent: string;
  soft: string;
  border: string;
  chip: string;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function pastelColor(color: string, strength: number): string {
  if (!HEX_COLOR.test(color)) return color;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  const mixed = channels.map((channel) =>
    Math.round(255 + (channel - 255) * strength)
      .toString(16)
      .padStart(2, "0")
  );
  return `#${mixed.join("")}`;
}

export function memberAppearance(
  color: string | null | undefined,
  fallback: string
): MemberAppearance {
  const accent = color && HEX_COLOR.test(color) ? color : fallback;
  return {
    accent,
    soft: pastelColor(accent, 0.19),
    border: pastelColor(accent, 0.3),
    chip: pastelColor(accent, 0.27)
  };
}

export function familyMemberColorForSource(
  sourceName: string,
  members: FamilyMemberColor[]
): string | undefined {
  const normalizedSource = sourceName.toLowerCase();
  return members.find((member) => normalizedSource.includes(member.displayName.toLowerCase()))?.color;
}
