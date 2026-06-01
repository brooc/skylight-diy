type RewardBalanceRow = {
  personId: string;
  displayName: string;
  balance: number;
};

export function RewardBalance({ balances }: { balances: RewardBalanceRow[] }): JSX.Element {
  return (
    <section className="grid gap-3 rounded-md border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">Reward balances</h2>
      <ul className="grid gap-2">
        {balances.map((row) => (
          <li key={row.personId} className="flex items-center justify-between text-sm">
            <span>{row.displayName}</span>
            <span className="rounded-md bg-slate-800 px-2 py-1 font-medium">
              {row.balance} pts
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
