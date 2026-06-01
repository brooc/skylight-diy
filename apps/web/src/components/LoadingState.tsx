export function LoadingState({ label = "Loading..." }: { label?: string }): JSX.Element {
  return (
    <div className="rounded-md border border-[#e0d6c7] bg-white p-6 text-base text-slate-700">
      {label}
    </div>
  );
}
