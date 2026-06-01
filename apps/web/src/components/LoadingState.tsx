export function LoadingState({ label = "Loading..." }: { label?: string }): JSX.Element {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
      {label}
    </div>
  );
}
