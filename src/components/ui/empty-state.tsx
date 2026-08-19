export function EmptyState({
  message,
  hint,
}: {
  message: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-bg-sunken/40 p-5 text-center">
      <p className="text-sm text-ink-faint">{message}</p>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}
