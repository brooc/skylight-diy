type RewardBalanceRow = {
  personId: string;
  displayName: string;
  balance: number;
};

export function RewardBalance({ balances }: { balances: RewardBalanceRow[] }): JSX.Element {
  return (
    <section className="grid gap-3 rounded-md border border-[#e0d6c7] bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">Reward balances</h2>
      <ul className="grid gap-2">
        {balances.map((row) => (
          <li key={row.personId} className="flex min-h-[44px] items-center justify-between text-sm">
            <span className="text-slate-700">{row.displayName}</span>
            <span className="rounded-md bg-[#f2ece2] px-2 py-1 font-semibold text-slate-800">
              {row.balance} pts
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
