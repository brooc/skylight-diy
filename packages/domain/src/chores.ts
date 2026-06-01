export type ChoreFrequency = "daily" | "weekly" | "once";

export type Chore = {
  id: string;
  householdId: string;
  assignedPersonId: string | null;
  title: string;
  description: string | null;
  points: number;
  frequency: ChoreFrequency;
  active: boolean;
  sortOrder: number;
};

export type ChoreCompletion = {
  id: string;
  choreId: string;
  personId: string | null;
  completedForDate: string;
  pointsAwarded: number;
  completedAt: string;
};
