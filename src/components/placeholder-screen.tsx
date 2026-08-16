export function PlaceholderScreen({
  title,
  phase,
  description,
  pending,
}: {
  title: string;
  phase: string;
  description: string;
  pending?: string[];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <span className="mb-2 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
          {phase}
        </span>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p>
      </div>

      {pending && pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-sm font-semibold text-amber-900">
            En attente de validation avant développement
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
            {pending.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
