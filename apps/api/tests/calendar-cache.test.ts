import { describe, expect, it } from "vitest";
import { buildSourceFingerprint } from "../src/modules/calendar/cache";
import { mergeSharedEvents } from "../src/modules/calendar/merge-shared-events";

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

describe("shared calendar events", () => {
  const base = {
    id: "source-1:event-1",
    providerEventId: "event-1",
    iCalUID: "shared-event@example.com",
    sourceId: "source-1",
    sourceName: "Parent",
    title: "Stay at Carmel Valley",
    start: "2026-07-20T16:00:00.000Z",
    end: "2026-07-20T17:00:00.000Z",
    isAllDay: false,
    attendeeEmails: ["kid@example.com"],
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    color: "#f3cfd0"
  };

  it("merges the same occurrence across calendars and preserves participant colors", () => {
    const events = mergeSharedEvents([
      base,
      {
        ...base,
        id: "source-2:event-2",
        providerEventId: "event-2",
        sourceId: "source-2",
        sourceName: "Kiddo",
        attendeeEmails: ["parent@example.com", "kid@example.com"],
        color: "#bee8ea"
      }
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      shared: true,
      sourceNames: ["Parent", "Kiddo"],
      colors: ["#f3cfd0", "#bee8ea"],
      attendeeEmails: ["kid@example.com", "parent@example.com"],
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      providerRefs: [
        { sourceId: "source-1", providerEventId: "event-1" },
        { sourceId: "source-2", providerEventId: "event-2" }
      ]
    });
  });

  it("keeps unrelated simultaneous events separate", () => {
    expect(
      mergeSharedEvents([
        base,
        { ...base, id: "source-2:event-2", providerEventId: "event-2", iCalUID: "different@example.com" }
      ])
    ).toHaveLength(2);
  });
});
