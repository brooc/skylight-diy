import { describe, expect, it } from "vitest";
import { buildSourceFingerprint } from "../src/modules/calendar/cache";

describe("calendar cache fingerprint", () => {
  const source = {
    id: "source-1",
    externalCalendarId: "family@example.com",
    enabled: true,
    displayName: "Family",
    color: "#8ec5b8",
    personId: "person-1",
    personName: "Parent"
  };

  it("is stable across source ordering", () => {
    const other = {
      ...source,
      id: "source-2",
      externalCalendarId: "school@example.com"
    };
    expect(buildSourceFingerprint([source, other])).toBe(buildSourceFingerprint([other, source]));
  });

  it.each(["displayName", "color", "personId", "personName"] as const)("changes when %s changes", (field) => {
    expect(buildSourceFingerprint([source])).not.toBe(
      buildSourceFingerprint([{ ...source, [field]: `${source[field]}-changed` }])
    );
  });
});
