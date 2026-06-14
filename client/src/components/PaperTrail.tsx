import { COMPLETION_META, fmtDate, fmtMins, fmtTime } from '../lib';
import type { Note, TimeLog } from '../types';

type Entry =
  | { kind: 'note'; date: string; note: Note }
  | { kind: 'log'; date: string; log: TimeLog };

export function PaperTrail({ notes, timeLogs }: { notes: Note[]; timeLogs: TimeLog[] }) {
  const entries: Entry[] = [
    ...notes.map((n) => ({ kind: 'note' as const, date: n.entry_date || n.created_at, note: n })),
    ...timeLogs.map((l) => ({ kind: 'log' as const, date: l.created_at, log: l })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
        No history yet. Notes and time logs added here become a permanent paper trail for this site.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 border-l border-slate-200 pl-4">
      {entries.map((e, i) => (
        <li key={i} className="relative">
          <span
            className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
              e.kind === 'log'
                ? 'bg-emerald-500'
                : e.note.source === 'office'
                  ? 'bg-violet-500'
                  : 'bg-blue-500'
            }`}
          />
          {e.kind === 'note' ? (
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="mb-0.5 flex items-center gap-2 text-xs">
                <span
                  className={`rounded px-1.5 py-0.5 font-medium ${
                    e.note.source === 'office'
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {e.note.source === 'office' ? 'Office' : 'Field'}
                </span>
                <span className="text-slate-400">
                  {e.note.author} · {fmtDate(e.date)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{e.note.body}</p>
            </div>
          ) : (
            <div className="rounded-lg bg-emerald-50/60 p-3">
              <div className="mb-0.5 flex items-center gap-2 text-xs">
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700">
                  Time log
                </span>
                <span className="text-slate-400">
                  {e.log.employee_initials ?? 'Field'} · {fmtDate(e.date)}
                </span>
              </div>
              <p className="text-sm text-slate-700">
                Onsite {fmtTime(e.log.arrived_at)} – {fmtTime(e.log.departed_at)}
                {e.log.actual_minutes != null && (
                  <span className="font-medium"> · {fmtMins(e.log.actual_minutes)} actual</span>
                )}
                <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${COMPLETION_META[e.log.completion_status].cls}`}>
                  {COMPLETION_META[e.log.completion_status].label}
                </span>
              </p>
              {e.log.note && <p className="mt-1 text-sm text-slate-600">{e.log.note}</p>}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
