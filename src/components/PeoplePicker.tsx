'use client';

import { shortName, type PersonRef } from '@/lib/meetings';

type Props = {
  legend: string;
  people: PersonRef[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Persona que siempre va incluida (quien propone). */
  lockedId?: string;
  disabled?: boolean;
};

const rowClass = 'flex items-center gap-2 min-h-8 px-1.5 rounded-[8px] text-[13px] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-card-hover)]';
const boxClass = 'w-4 h-4 shrink-0 accent-[var(--accent)]';

/** Casillas para elegir responsables; cada persona recibe su propia tarea. */
export function PeoplePicker({ legend, people, selected, onChange, lockedId, disabled }: Props) {
  const count = people.filter((p) => selected.includes(p.id)).length;
  const all = people.length > 0 && count === people.length;

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-1 min-w-0 disabled:opacity-70">
      <legend className="text-[11px] text-[var(--text-secondary)] mb-1">
        {legend}
        {count > 1 && ` · ${count} personas, una tarea para cada una`}
      </legend>
      <div className="scroll-list-sm grid grid-cols-2 gap-x-2 rounded-[10px] surface-card border border-[var(--border-card)] p-1.5">
        {people.length > 1 && (
          <label className={`${rowClass} col-span-2 font-semibold`}>
            <input
              type="checkbox"
              name="todos"
              className={boxClass}
              checked={all}
              onChange={(e) => onChange(e.target.checked ? people.map((p) => p.id) : lockedId ? [lockedId] : [])}
            />
            Todos
          </label>
        )}
        {people.map((p) => (
          <label key={p.id} className={rowClass} title={p.email}>
            <input
              type="checkbox"
              name="responsables"
              className={boxClass}
              checked={selected.includes(p.id)}
              disabled={p.id === lockedId}
              onChange={(e) => onChange(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))}
            />
            <span className="min-w-0 truncate">{shortName(p.email)}</span>
          </label>
        ))}
        {people.length === 0 && <span className="col-span-2 px-1.5 py-1 text-[13px] text-[var(--text-secondary)]">No hay personas para elegir.</span>}
      </div>
    </fieldset>
  );
}
