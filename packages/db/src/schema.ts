import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const households = pgTable("households", {
  id: id(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  adminPinHash: text("admin_pin_hash"),
  adminPinSetAt: timestamp("admin_pin_set_at", { withTimezone: true }),
  setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const people = pgTable("people", {
  id: id(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  color: text("color").notNull(),
  role: text("role").notNull().default("child"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const chores = pgTable("chores", {
  id: id(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  assignedPersonId: uuid("assigned_person_id").references(() => people.id, {
    onDelete: "set null"
  }),
  title: text("title").notNull(),
  description: text("description"),
  points: integer("points").notNull().default(1),
  frequency: text("frequency").notNull().default("daily"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const choreCompletions = pgTable(
  "chore_completions",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    choreId: uuid("chore_id")
      .notNull()
      .references(() => chores.id, { onDelete: "cascade" }),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "set null"
    }),
    completedForDate: date("completed_for_date").notNull(),
    pointsAwarded: integer("points_awarded").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    uniqueByDate: uniqueIndex("chore_completions_unique_by_chore_date").on(
      table.choreId,
      table.completedForDate
    )
  })
);

export const rewardRedemptions = pgTable("reward_redemptions", {
  id: id(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  pointsSpent: integer("points_spent").notNull(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true })
    .notNull()
    .defaultNow()
});

export const meals = pgTable("meals", {
  id: id(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const mealPlanEntries = pgTable("meal_plan_entries", {
  id: id(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  mealId: uuid("meal_id").references(() => meals.id, { onDelete: "set null" }),
  plannedDate: date("planned_date").notNull(),
  slot: text("slot").notNull().default("dinner"),
  customTitle: text("custom_title"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const connectedAccounts = pgTable("connected_accounts", {
  id: id(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id"),
  displayName: text("display_name"),
  email: text("email"),
  encryptedAccessToken: text("encrypted_access_token"),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true
  }),
  reauthorizationRequired: boolean("reauthorization_required")
    .notNull()
    .default(false),
  scopes: text("scopes")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const calendarSources = pgTable(
  "calendar_sources",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    connectedAccountId: uuid("connected_account_id")
      .notNull()
      .references(() => connectedAccounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalCalendarId: text("external_calendar_id").notNull(),
    displayName: text("display_name").notNull(),
    color: text("color"),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "set null"
    }),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => ({
    uniqueExternalCalendar: uniqueIndex(
      "calendar_sources_unique_connected_external_calendar"
    ).on(table.connectedAccountId, table.externalCalendarId)
  })
);

export const calendarFetchLogs = pgTable("calendar_fetch_logs", {
  id: id(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  calendarSourceId: uuid("calendar_source_id").references(
    () => calendarSources.id,
    { onDelete: "set null" }
  ),
  rangeStart: timestamp("range_start", { withTimezone: true }).notNull(),
  rangeEnd: timestamp("range_end", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow()
});

export const calendarEventCache = pgTable(
  "calendar_event_cache",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    cacheKey: text("cache_key").notNull(),
    rangeStart: timestamp("range_start", { withTimezone: true }).notNull(),
    rangeEnd: timestamp("range_end", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    payloadJsonb: jsonb("payload_jsonb").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    staleUntil: timestamp("stale_until", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => ({
    uniqueCacheKey: uniqueIndex("calendar_event_cache_unique_household_cache_key").on(
      table.householdId,
      table.cacheKey
    )
  })
);
