export function DegradedStateBanner({
  message
}: {
  message: string;
}): JSX.Element {
  return (
    <div className="rounded-md border border-amber-700 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
      {message}
    </div>
  );
}
