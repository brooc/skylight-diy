import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { dateKeyInTimeZone, formatDateKey } from "../calendar/dateKeys";

type MealsResponse = {
  timezone: string;
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

type MealLibraryResponse = {
  meals: Array<{ id: string; name: string }>;
};

export function MealPlanWeek(): JSX.Element {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [slot, setSlot] = useState<"breakfast" | "lunch" | "dinner">("dinner");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const mealsQuery = useQuery({
    queryKey: queryKeys.weekMeals,
    queryFn: () => apiFetch<MealsResponse>("/meals/week")
  });
  const mealLibraryQuery = useQuery({
    queryKey: queryKeys.mealLibrary,
    queryFn: () => apiFetch<MealLibraryResponse>("/meals")
  });

  const todayKey = useMemo(
    () => dateKeyInTimeZone(new Date(), mealsQuery.data?.timezone ?? "UTC"),
    [mealsQuery.data?.timezone]
  );
  const days = mealsQuery.data?.days ?? [];
  const defaultDate = days[0]?.date ?? todayKey;
  const activeDates = selectedDates;
  const canSubmit = title.trim().length > 0 && activeDates.length > 0 && !isSubmitting;
  const addRequested = searchParams.get("add") === "1";

  useEffect(() => {
    if (addRequested) {
      setIsAdding(true);
      setSelectedDates((current) => current.length > 0 ? current : [defaultDate]);
    }
  }, [addRequested, defaultDate]);

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
                setSelectedDates([]);
                setSubmitError(null);
              }}
            >
              Cancel
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(12rem,0.45fr)_minmax(0,1fr)]">
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
            <label className="grid gap-1" htmlFor="meal-name">
              <span className="text-sm font-medium text-slate-700">Meal</span>
              <input
                id="meal-name"
                aria-label="Meal"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                list="saved-meals"
                className="min-h-[44px] rounded-md border border-[#d9d8d4] bg-white px-3 text-base text-slate-900"
                placeholder="Choose or name a meal"
              />
              <datalist id="saved-meals">
                {(mealLibraryQuery.data?.meals ?? []).map((meal) => (
                  <option key={meal.id} value={meal.name} />
                ))}
              </datalist>
              <span className="text-xs text-slate-500">
                New meals are saved so you can choose them again later.
              </span>
            </label>
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-slate-700">Days</legend>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {days.map((day) => {
                const isSelected = activeDates.includes(day.date);
                const label = formatDateKey(day.date, { weekday: "short", month: "short", day: "numeric" });
                return (
                  <button
                    key={day.date}
                    type="button"
                    aria-label={label}
                    aria-pressed={isSelected}
                    className={`min-h-[52px] rounded-md border px-2 py-1 text-sm font-semibold ${
                      isSelected
                        ? "border-[#0f766e] bg-[#dcefeb] text-[#0f5f59]"
                        : "border-[#d9d8d4] bg-white text-slate-700 hover:bg-[#fff7ea]"
                    }`}
                    onClick={() => {
                      setSelectedDates((current) => {
                        return current.includes(day.date)
                          ? current.filter((date) => date !== day.date)
                          : [...current, day.date];
                      });
                    }}
                  >
                    <span className="block">{formatDateKey(day.date, { weekday: "short" })}</span>
                    <span className="block text-xs font-normal">{formatDateKey(day.date, { month: "short", day: "numeric" })}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
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
                      dates: activeDates,
                      slot,
                      mealName: title.trim()
                    })
                  });
                  setTitle("");
                  setSlot("dinner");
                  setSelectedDates([]);
                  setIsAdding(false);
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: queryKeys.weekMeals }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.mealLibrary })
                  ]);
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
        {actionError ? <p className="text-sm text-rose-700">{actionError}</p> : null}
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
                  {formatDateKey(day.date, {
                    weekday: "long",
                    month: "short",
                    day: "numeric"
                  })}
                </h2>
                <ul className="mt-2 grid gap-2 text-sm text-slate-700">
                  {day.entries.length > 0 ? (
                    day.entries.map((entry) => (
                      <li key={entry.id} className="flex min-h-[44px] items-center justify-between gap-2 rounded-md bg-[#f8f2e8] px-2 py-2">
                        <div>
                          <div className="font-medium text-slate-900">
                            {entry.customTitle || entry.mealName || "Meal"}
                          </div>
                          <div className="text-xs uppercase tracking-wide text-slate-500">{entry.slot}</div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${entry.customTitle || entry.mealName || "meal"}`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-rose-700"
                          onClick={async () => {
                            setActionError(null);
                            try {
                              await apiFetch(`/meals/week/entries/${entry.id}`, { method: "DELETE" });
                              await queryClient.invalidateQueries({ queryKey: queryKeys.weekMeals });
                            } catch (error) {
                              setActionError(error instanceof Error ? error.message : "Failed to remove meal.");
                            }
                          }}
                        >
                          ×
                        </button>
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
          setSelectedDates([defaultDate]);
          setIsAdding(true);
        }}
      >
        <span className="relative -top-px text-4xl font-normal leading-none">+</span>
      </button>
    </>
  );
}
