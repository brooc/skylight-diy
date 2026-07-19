import { memberAppearance } from "../family/memberAppearance";

type RewardBalanceRow = {
  personId: string;
  displayName: string;
  color: string;
  balance: number;
};

export function RewardBalance({ balances }: { balances: RewardBalanceRow[] }): JSX.Element {
  return (
    <section className="grid gap-3 rounded-md border border-[#e0d6c7] bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">Reward balances</h2>
      <ul className="grid gap-2">
        {balances.map((row) => {
          const appearance = memberAppearance(row.color, "#0f766e");
          return (
            <li
              key={row.personId}
              className="flex min-h-[44px] items-center justify-between rounded-lg px-2 text-sm"
              style={{ backgroundColor: appearance.soft }}
            >
              <span className="text-slate-700">{row.displayName}</span>
              <span
                className="rounded-md px-2 py-1 font-semibold text-slate-800"
                style={{ backgroundColor: appearance.chip }}
              >
                {row.balance} pts
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
