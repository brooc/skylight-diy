import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { CalendarDayView } from "../calendar/CalendarDayView";
import { ChoreList } from "../chores/ChoreList";
import { RewardBalance } from "../chores/RewardBalance";

type ChoresResponse = {
  chores: Array<{
    id: string;
    title: string;
    points: number;
    assignedPersonName?: string | null;
    completed: boolean;
  }>;
};

type RewardsResponse = {
  balances: Array<{
    personId: string;
    displayName: string;
    balance: number;
  }>;
};

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

type CalendarResponse = {
  events: Array<{
    id: string;
    title: string;
    start: string;
    end: string;
    isAllDay: boolean;
    sourceName?: string;
    color?: string;
  }>;
};

export function TodayDashboard(): JSX.Element {
  const queryClient = useQueryClient();
  const choresQuery = useQuery({
    queryKey: queryKeys.todayChores,
    queryFn: () => apiFetch<ChoresResponse>("/chores/today")
  });
  const rewardsQuery = useQuery({
    queryKey: queryKeys.rewardBalances,
    queryFn: () => apiFetch<RewardsResponse>("/rewards/balances")
  });
  const mealsQuery = useQuery({
    queryKey: queryKeys.weekMeals,
    queryFn: () => apiFetch<MealsResponse>("/meals/week")
  });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  const calendarQuery = useQuery({
    queryKey: ["calendar-day", start.toISOString(), end.toISOString(), timezone],
    queryFn: () =>
      apiFetch<CalendarResponse>(
        `/calendar/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&timezone=${encodeURIComponent(timezone)}`
      )
  });

  if (choresQuery.isLoading || rewardsQuery.isLoading || mealsQuery.isLoading || calendarQuery.isLoading) {
    return <LoadingState label="Loading dashboard..." />;
  }
  if (choresQuery.isError) return <ErrorState message={choresQuery.error.message} />;
  if (rewardsQuery.isError) return <ErrorState message={rewardsQuery.error.message} />;
  if (mealsQuery.isError) return <ErrorState message={mealsQuery.error.message} />;
  if (calendarQuery.isError) return <ErrorState message={calendarQuery.error.message} />;

  const todayKey = new Date().toISOString().slice(0, 10);
  const tonight =
    mealsQuery.data?.days.find((day) => day.date === todayKey)?.entries[0]?.customTitle ??
    mealsQuery.data?.days.find((day) => day.date === todayKey)?.entries[0]?.mealName ??
    "No dinner planned";

  return (
    <section className="grid gap-4">
      <header className="grid gap-1 rounded-md border border-slate-800 bg-slate-900 p-4">
        <h1 className="text-2xl font-semibold">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric"
          })}
        </h1>
        <p className="text-sm text-slate-300">Tonight: {tonight}</p>
      </header>
      <CalendarDayView title="Today's events" events={calendarQuery.data?.events ?? []} />
      <ChoreList
        chores={choresQuery.data?.chores ?? []}
        onToggle={async (chore, nextCompleted) => {
          if (nextCompleted) {
            await apiFetch(`/chores/${chore.id}/complete`, { method: "POST" });
          } else {
            const date = new Date().toISOString().slice(0, 10);
            await apiFetch(`/chores/${chore.id}/complete?date=${date}`, { method: "DELETE" });
          }

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.todayChores }),
            queryClient.invalidateQueries({ queryKey: queryKeys.rewardBalances })
          ]);
        }}
      />
      <RewardBalance balances={rewardsQuery.data?.balances ?? []} />
    </section>
  );
}
