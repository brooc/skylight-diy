import { memberAppearance } from "../family/memberAppearance";

type RewardBalanceRow = {
  personId: string;
  displayName: string;
  color: string;
  balance: number;
};

export function RewardBalance({
  balances,
  canManage = false,
  onUsePoints,
  onReset
}: {
  balances: RewardBalanceRow[];
  canManage?: boolean;
  onUsePoints?: (row: RewardBalanceRow) => void;
  onReset?: (row: RewardBalanceRow) => void;
}): JSX.Element {
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
              <div className="flex items-center gap-2">
                <span className="rounded-md px-2 py-1 font-semibold text-slate-800" style={{ backgroundColor: appearance.chip }}>{row.balance} pts</span>
                {canManage && onUsePoints ? <button type="button" disabled={row.balance <= 0} className="min-h-[36px] rounded-md bg-white px-2 font-semibold text-slate-700 disabled:opacity-40" onClick={() => onUsePoints(row)}>Use</button> : null}
                {canManage && onReset ? <button type="button" disabled={row.balance <= 0} className="min-h-[36px] rounded-md bg-white px-2 font-semibold text-rose-700 disabled:opacity-40" onClick={() => onReset(row)}>Reset</button> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
