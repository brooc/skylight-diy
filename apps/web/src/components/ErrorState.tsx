export function ErrorState({ message }: { message: string }): JSX.Element {
  return (
    <div className="rounded-md border border-rose-900 bg-rose-950/20 p-6 text-sm text-rose-200">
      {message}
    </div>
  );
}
