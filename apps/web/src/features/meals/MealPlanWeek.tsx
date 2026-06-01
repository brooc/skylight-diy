import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
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
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [slot, setSlot] = useState<"breakfast" | "lunch" | "dinner">("dinner");
  const [date, setDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const mealsQuery = useQuery({
    queryKey: queryKeys.weekMeals,
    queryFn: () => apiFetch<MealsResponse>("/meals/week")
  });

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const days = mealsQuery.data?.days ?? [];
  const canSubmit = title.trim().length > 0 && date.length === 10 && !isSubmitting;
  const defaultDate = days[0]?.date ?? todayKey;
  const activeDate = date || defaultDate;

  if (mealsQuery.isLoading) {
    return <LoadingState label="Loading meal plan..." />;
  }

  if (mealsQuery.isError) {
    return <ErrorState message={mealsQuery.error.message} />;
  }

  return (
    <>
      {isAdding ? (
        <section className="grid gap-3 rounded-md border border-[#e7e7e5] bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-2xl text-slate-900">Add meal entry</h2>
            <button
              type="button"
              className="rounded-md border border-[#d8cbb8] bg-[#fff7ea] px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-[#fcedd8]"
              onClick={() => {
                setIsAdding(false);
                setSubmitError(null);
              }}
            >
              Cancel
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1">
              <span className="text-sm font-medium text-slate-700">Date</span>
              <select
                value={activeDate}
                onChange={(event) => setDate(event.target.value)}
                className="min-h-[44px] rounded-md border border-[#d9d8d4] bg-white px-3 text-base text-slate-900"
              >
                {days.map((day) => (
                  <option key={day.date} value={day.date}>
                    {new Date(day.date).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric"
                    })}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium text-slate-700">Slot</span>
              <select
                value={slot}
                onChange={(event) => setSlot(event.target.value as "breakfast" | "lunch" | "dinner")}
                className="min-h-[44px] rounded-md border border-[#d9d8d4] bg-white px-3 text-base text-slate-900"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
              </select>
            </label>
            <label className="grid gap-1 md:col-span-1">
              <span className="text-sm font-medium text-slate-700">Meal</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="min-h-[44px] rounded-md border border-[#d9d8d4] bg-white px-3 text-base text-slate-900"
                placeholder="Meal name"
              />
            </label>
          </div>
          {submitError ? <p className="text-sm text-rose-700">{submitError}</p> : null}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!canSubmit}
              className="min-h-[44px] rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d5f59] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={async () => {
                setSubmitError(null);
                setIsSubmitting(true);
                try {
                  await apiFetch("/meals/week/entries", {
                    method: "POST",
                    body: JSON.stringify({
                      date: activeDate,
                      slot,
                      title: title.trim()
                    })
                  });
                  setTitle("");
                  setSlot("dinner");
                  setDate("");
                  setIsAdding(false);
                  await queryClient.invalidateQueries({ queryKey: queryKeys.weekMeals });
                } catch (error) {
                  setSubmitError(error instanceof Error ? error.message : "Failed to add meal.");
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              {isSubmitting ? "Saving..." : "Add meal"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3">
        <h1 className="font-display text-3xl text-slate-900">Meals this week</h1>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {days.map((day) => {
            const isToday = day.date === todayKey;
            return (
              <article
                key={day.date}
                className={`rounded-md border p-4 ${
                  isToday ? "border-[#9bc2df] bg-[#f3f8fc]" : "border-[#e0d6c7] bg-white"
                }`}
              >
                <h2 className="text-base font-semibold text-slate-900">
                  {new Date(day.date).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric"
                  })}
                </h2>
                <ul className="mt-2 grid gap-2 text-sm text-slate-700">
                  {day.entries.length > 0 ? (
                    day.entries.map((entry) => (
                      <li key={entry.id} className="min-h-[44px] rounded-md bg-[#f8f2e8] px-2 py-2">
                        <div className="font-medium text-slate-900">
                          {entry.customTitle || entry.mealName || "Meal"}
                        </div>
                        <div className="text-xs uppercase tracking-wide text-slate-500">{entry.slot}</div>
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-500">No meal planned</li>
                  )}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        aria-label="Add"
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#2b98db] text-white shadow-[0_6px_16px_rgba(30,64,175,0.22)] transition-colors hover:bg-[#2588c3]"
        onClick={() => {
          setSubmitError(null);
          setIsAdding(true);
        }}
      >
        <span className="relative -top-px text-4xl font-normal leading-none">+</span>
      </button>
    </>
  );
}
