export type Meal = {
  id: string;
  householdId: string;
  name: string;
  notes: string | null;
};

export type MealPlanEntry = {
  id: string;
  householdId: string;
  mealId: string | null;
  plannedDate: string;
  slot: string;
  customTitle: string | null;
  notes: string | null;
};
