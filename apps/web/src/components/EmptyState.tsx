export function EmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}): JSX.Element {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-300">{description}</p>
    </div>
  );
}
