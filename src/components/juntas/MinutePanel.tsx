'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CircleDot, ListTodo, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { MINUTE_LABEL, type MinuteItem, type MinuteKind } from '@/lib/meetings';

const KINDS: { kind: MinuteKind; icon: typeof CircleDot; placeholder: string }[] = [
  { kind: 'tema', icon: MessageSquare, placeholder: 'Agregar tema…' },
  { kind: 'acuerdo', icon: Check, placeholder: 'Agregar acuerdo…' },
  { kind: 'pendiente', icon: ListTodo, placeholder: 'Agregar pendiente…' },
];

type Props = {
  meetingId: string;
  items: MinuteItem[];
  notes: string;
  canWrite: boolean;
  isJefe: boolean;
  currentUserId?: string;
  onChanged: () => void;
};

export function MinutePanel({ meetingId, items, notes, canWrite, isJefe, currentUserId, onChanged }: Props) {
  const [drafts, setDrafts] = useState<Record<MinuteKind, string>>({ tema: '', acuerdo: '', pendiente: '' });
  const [notesDraft, setNotesDraft] = useState(notes);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);

  // Si otra persona cambia las notas, se reflejan mientras no las estés editando.
  const [lastNotes, setLastNotes] = useState(notes);
  if (notes !== lastNotes) {
    setLastNotes(notes);
    if (!editingNotes) setNotesDraft(notes);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const add = async (kind: MinuteKind) => {
    const content = drafts[kind].trim();
    if (!content) return;
    setError(null);
    const position = items.filter((i) => i.kind === kind).reduce((m, i) => Math.max(m, i.position), 0) + 1;
    const { error: err } = await supabase.from('meeting_minute_items').insert({ meeting_id: meetingId, kind, content, position });
    if (err) {
      setError('No se pudo agregar a la minuta.');
      return;
    }
    setDrafts((d) => ({ ...d, [kind]: '' }));
    onChanged();
  };

  const remove = async (id: string) => {
    const { error: err } = await supabase.from('meeting_minute_items').delete().eq('id', id);
    if (err) setError('No se pudo quitar el elemento.');
    else onChanged();
  };

  const onNotes = (value: string) => {
    setEditingNotes(true);
    setNotesDraft(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error: err } = await supabase.from('meetings').update({ notes: value }).eq('id', meetingId);
      setEditingNotes(false);
      if (err) setError('No se pudieron guardar las notas.');
      else setSavedAt(new Date());
    }, 700);
  };

  return (
    <section className="glass-panel glass-iridescent rounded-[28px] p-5 flex flex-col gap-5 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Minuta</h2>
        {savedAt && (
          <span className="chip-glass font-mono text-[11px] px-2 py-1 rounded-[8px] text-[var(--text-secondary)]">
            notas guardadas {savedAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {KINDS.map(({ kind, icon: Icon, placeholder }) => {
        const list = items.filter((i) => i.kind === kind).sort((a, b) => a.position - b.position);
        return (
          <div key={kind} className="flex flex-col gap-2">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">{MINUTE_LABEL[kind]}</h3>
            {list.length > 0 && (
              <ol className="chip-glass rounded-[16px] p-3 flex flex-col gap-2">
                {list.map((item, i) => (
                  <li key={item.id} className="group flex items-start gap-2.5 text-sm leading-relaxed text-[var(--text-primary)]">
                    {kind === 'tema' ? (
                      <span className="font-mono text-xs font-bold text-[var(--accent)] pt-0.5 w-5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                    ) : (
                      <Icon size={16} className="shrink-0 mt-0.5" style={{ color: kind === 'acuerdo' ? 'var(--ok-text)' : 'var(--prio-media-text)' }} />
                    )}
                    <span className="flex-1 min-w-0 break-words">{item.content}</span>
                    {(isJefe || item.created_by === currentUserId) && canWrite && (
                      <button
                        onClick={() => remove(item.id)}
                        aria-label="Quitar de la minuta"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-[6px] text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-500 transition-opacity"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {canWrite && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  add(kind);
                }}
                className="flex gap-2"
              >
                <label className="sr-only" htmlFor={`minute-${kind}`}>{placeholder}</label>
                <input
                  id={`minute-${kind}`}
                  value={drafts[kind]}
                  onChange={(e) => setDrafts((d) => ({ ...d, [kind]: e.target.value }))}
                  placeholder={placeholder}
                  className="flex-1 min-w-0 min-h-10 rounded-[12px] px-3 text-sm surface-card border border-[var(--border-card)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
                />
                <button type="submit" aria-label={`Agregar a ${MINUTE_LABEL[kind]}`} disabled={!drafts[kind].trim()} className="w-10 h-10 shrink-0 rounded-[12px] chip-glass border border-[var(--border-card)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40">
                  <Plus size={16} />
                </button>
              </form>
            )}
            {!canWrite && list.length === 0 && <p className="text-sm text-[var(--text-secondary)] italic">Sin elementos.</p>}
          </div>
        );
      })}

      <label className="flex flex-col gap-2">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Notas libres</span>
        {isJefe && canWrite ? (
          <textarea
            rows={4}
            value={notesDraft}
            onChange={(e) => onNotes(e.target.value)}
            placeholder="Lo que vaya surgiendo…"
            className="rounded-[14px] px-3 py-2.5 text-sm leading-relaxed surface-card border border-[var(--border-card)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--accent)] resize-y"
          />
        ) : (
          <p className="chip-glass rounded-[14px] px-3 py-2.5 text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap min-h-12">
            {notes || <span className="text-[var(--text-secondary)] italic">Sin notas.</span>}
          </p>
        )}
      </label>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </section>
  );
}
