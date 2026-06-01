import { useQueryClient, useQuery } from "@tanstack/react-query";
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

  if (chores.length === 0) {
    return (
      <EmptyState
        title="No chores yet"
        description="Run setup/seed data or add chores in the next build slice."
      />
    );
  }

  return (
    <div className="grid gap-4">
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
      <RewardBalance balances={balances} />
    </div>
  );
}
