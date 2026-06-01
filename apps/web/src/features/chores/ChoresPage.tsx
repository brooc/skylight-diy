import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { ChoreList } from "./ChoreList";
import { RewardBalance } from "./RewardBalance";

type ChoreResponse = {
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

export function ChoresPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState(1);
  const [assignedPersonId, setAssignedPersonId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const choresQuery = useQuery({
    queryKey: queryKeys.todayChores,
    queryFn: () => apiFetch<ChoreResponse>("/chores/today")
  });
  const rewardsQuery = useQuery({
    queryKey: queryKeys.rewardBalances,
    queryFn: () => apiFetch<RewardsResponse>("/rewards/balances")
  });

  if (choresQuery.isLoading || rewardsQuery.isLoading) {
    return <LoadingState />;
  }

  if (choresQuery.isError) {
    return <ErrorState message={choresQuery.error.message} />;
  }

  if (rewardsQuery.isError) {
    return <ErrorState message={rewardsQuery.error.message} />;
  }

  const chores = choresQuery.data?.chores ?? [];
  const balances = rewardsQuery.data?.balances ?? [];
  const canSubmit = title.trim().length > 0 && points >= 1 && points <= 100 && !isSubmitting;

  return (
    <div className="grid gap-4">
      {isAdding ? (
        <section className="grid gap-3 rounded-md border border-[#e7e7e5] bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-2xl text-slate-900">Add task</h2>
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
            <label className="grid gap-1 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="min-h-[44px] rounded-md border border-[#d9d8d4] bg-white px-3 text-base text-slate-900"
                placeholder="Task name"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium text-slate-700">Points</span>
              <input
                value={points}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setPoints(Number.isFinite(next) ? next : 1);
                }}
                type="number"
                min={1}
                max={100}
                className="min-h-[44px] rounded-md border border-[#d9d8d4] bg-white px-3 text-base text-slate-900"
              />
            </label>
            <label className="grid gap-1 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Assigned person</span>
              <select
                value={assignedPersonId}
                onChange={(event) => setAssignedPersonId(event.target.value)}
                className="min-h-[44px] rounded-md border border-[#d9d8d4] bg-white px-3 text-base text-slate-900"
              >
                <option value="">Unassigned</option>
                {balances.map((person) => (
                  <option key={person.personId} value={person.personId}>
                    {person.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {submitError ? <p className="text-sm text-rose-700">{submitError}</p> : null}
          <div className="flex justify-end">
            <button
              type="button"
              className="min-h-[44px] rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d5f59] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canSubmit}
              onClick={async () => {
                setSubmitError(null);
                setIsSubmitting(true);
                try {
                  await apiFetch("/chores", {
                    method: "POST",
                    body: JSON.stringify({
                      title: title.trim(),
                      points,
                      assignedPersonId: assignedPersonId || null
                    })
                  });
                  setTitle("");
                  setPoints(1);
                  setAssignedPersonId("");
                  setIsAdding(false);
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: queryKeys.todayChores }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.rewardBalances })
                  ]);
                } catch (error) {
                  setSubmitError(error instanceof Error ? error.message : "Failed to create task.");
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              {isSubmitting ? "Adding..." : "Add task"}
            </button>
          </div>
        </section>
      ) : null}
      {chores.length === 0 ? (
        <EmptyState
          title="No chores yet"
          description="Use the + button to add your first task."
        />
      ) : (
        <ChoreList
          chores={chores}
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
      )}
      <RewardBalance balances={balances} />
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
    </div>
  );
}
