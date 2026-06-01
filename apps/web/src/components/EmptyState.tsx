export function EmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}): JSX.Element {
  return (
    <div className="rounded-md border border-[#e0d6c7] bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </div>
  );
}
