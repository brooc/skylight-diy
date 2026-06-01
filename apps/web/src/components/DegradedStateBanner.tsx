export function DegradedStateBanner({
  message
}: {
  message: string;
}): JSX.Element {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {message}
    </div>
  );
}
