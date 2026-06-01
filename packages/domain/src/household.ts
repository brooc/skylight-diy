export type PersonRole = "adult" | "child";

export type Household = {
  id: string;
  name: string;
  timezone: string;
  setupCompletedAt: string | null;
};

export type Person = {
  id: string;
  householdId: string;
  displayName: string;
  color: string;
  role: PersonRole;
  sortOrder: number;
};
