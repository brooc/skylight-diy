export function ErrorState({ message }: { message: string }): JSX.Element {
  return (
    <div className="rounded-md border border-rose-300 bg-rose-50 p-6 text-sm text-rose-900">
      {message}
    </div>
  );
}
