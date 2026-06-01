import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";

type MealsResponse = {
  days: Array<{
    date: string;
    entries: Array<{
      id: string;
      slot: string;
      mealName?: string | null;
      customTitle?: string | null;
    }>;
  }>;
};

export function MealPlanWeek(): JSX.Element {
  const mealsQuery = useQuery({
    queryKey: queryKeys.weekMeals,
    queryFn: () => apiFetch<MealsResponse>("/meals/week")
  });

  if (mealsQuery.isLoading) {
    return <LoadingState />;
  }

  if (mealsQuery.isError) {
    return <ErrorState message={mealsQuery.error.message} />;
  }

  const days = mealsQuery.data?.days ?? [];
  if (days.length === 0) {
    return (
      <EmptyState
        title="No meal plan yet"
        description="Seed data or meal editing flows are coming next."
      />
    );
  }

  return (
    <section className="grid gap-3">
      <h1 className="text-xl font-semibold">Meals this week</h1>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {days.map((day) => (
          <article key={day.date} className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold">{day.date}</h2>
            <ul className="mt-2 grid gap-2 text-sm text-slate-300">
              {day.entries.length > 0 ? (
                day.entries.map((entry) => (
                  <li key={entry.id} className="rounded-md bg-slate-800 px-2 py-2">
                    {(entry.customTitle || entry.mealName || "Meal") + ` (${entry.slot})`}
                  </li>
                ))
              ) : (
                <li className="text-slate-500">No meal planned</li>
              )}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
