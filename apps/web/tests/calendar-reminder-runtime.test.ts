import { describe, expect, it } from "vitest";
import {
  isReminderDue,
  isSnoozedReminderDue,
  reminderAnnouncement,
  reminderOccurrenceKey,
  type DaymarkReminderEvent,
  type SnoozedReminder,
} from "../src/components/CalendarReminderRuntime";

const event: DaymarkReminderEvent = {
  id: "shared-event",
  title: "Learn Hebrew",
  start: "2026-08-03T17:00:00.000Z",
  isAllDay: false,
  reminderMinutesBefore: [30, 10],
};

describe("calendar reminder runtime", () => {
  it("tracks each reminder time on a shared event independently", () => {
    expect(reminderOccurrenceKey(event, 30)).not.toBe(
      reminderOccurrenceKey(event, 10),
    );
    expect(
      isReminderDue(event, 30, new Date("2026-08-03T16:30:30.000Z"), "UTC"),
    ).toBe(true);
    expect(
      isReminderDue(event, 10, new Date("2026-08-03T16:30:30.000Z"), "UTC"),
    ).toBe(false);
  });

  it("builds natural announcements", () => {
    expect(reminderAnnouncement(event, 0)).toBe(
      "Reminder. Learn Hebrew starts now.",
    );
    expect(reminderAnnouncement(event, 60)).toBe(
      "Reminder. Learn Hebrew starts in one hour.",
    );
    expect(reminderAnnouncement(event, 10)).toBe(
      "Reminder. Learn Hebrew starts in 10 minutes.",
    );
  });

  it("uses the household timezone for all-day reminder timing", () => {
    const allDayEvent: DaymarkReminderEvent = {
      ...event,
      start: "2026-08-03",
      isAllDay: true,
      reminderMinutesBefore: [60],
    };
    expect(
      isReminderDue(
        allDayEvent,
        60,
        new Date("2026-08-03T06:00:30.000Z"),
        "America/Los_Angeles",
      ),
    ).toBe(true);
  });

  it("fires a snooze once its persisted due time arrives", () => {
    const snoozed: SnoozedReminder = {
      id: "shared-event-snooze",
      event,
      minutesBefore: 10,
      dueAt: new Date("2026-08-03T17:10:00.000Z").getTime(),
    };
    expect(
      isSnoozedReminderDue(
        snoozed,
        new Date("2026-08-03T17:09:59.000Z"),
      ),
    ).toBe(false);
    expect(
      isSnoozedReminderDue(
        snoozed,
        new Date("2026-08-03T17:10:01.000Z"),
      ),
    ).toBe(true);
  });
});
