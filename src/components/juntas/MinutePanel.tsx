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

      {(isJefe && canWrite) || notes ? (
        <label className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Notas generales</span>
            <span className="text-[11px] text-[var(--text-secondary)]">{isJefe ? 'las ven todos los asistentes' : 'del jefe'}</span>
          </span>
          {isJefe && canWrite ? (
            <textarea
              rows={3}
              value={notesDraft}
              onChange={(e) => onNotes(e.target.value)}
              placeholder="Lo que todos deben ver…"
              className="rounded-[14px] px-3 py-2.5 text-sm leading-relaxed surface-card border border-[var(--border-card)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--accent)] resize-y"
            />
          ) : (
            <p className="chip-glass rounded-[14px] px-3 py-2.5 text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">{notes}</p>
          )}
        </label>
      ) : null}

      <MyNotes meetingId={meetingId} userId={currentUserId} canWrite={canWrite} />

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </section>
  );
}

/** Notas personales de cada asistente: privadas y con guardado automático. */
function MyNotes({ meetingId, userId, canWrite }: { meetingId: string; userId?: string; canWrite: boolean }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'cargando' | 'listo' | 'guardando' | 'guardado' | 'error' | 'no-disponible'>('cargando');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('meeting_notes')
        .select('content, updated_at')
        .eq('meeting_id', meetingId)
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      // 42P01 / PGRST205: la tabla aún no existe (migración sin aplicar).
      if (error && (error.code === '42P01' || error.code === 'PGRST205')) {
        setStatus('no-disponible');
        return;
      }
      setText(data?.content ?? '');
      setSavedAt(data?.updated_at ? new Date(data.updated_at) : null);
      setStatus(error ? 'error' : 'listo');
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId, userId]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!userId || status === 'no-disponible') return null;

  const onChange = (value: string) => {
    setText(value);
    setStatus('guardando');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const now = new Date();
      const { error } = await supabase
        .from('meeting_notes')
        .upsert({ meeting_id: meetingId, user_id: userId, content: value, updated_at: now.toISOString() }, { onConflict: 'meeting_id,user_id' });
      if (error) {
        setStatus('error');
        return;
      }
      setSavedAt(now);
      setStatus('guardado');
    }, 700);
  };

  const hint =
    status === 'guardando' ? 'guardando…'
      : status === 'error' ? 'no se pudo guardar'
        : savedAt ? `guardado ${savedAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
          : 'solo tú las ves';

  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Mis notas</span>
        <span className="text-[11px]" style={{ color: status === 'error' ? 'var(--prio-alta-text)' : 'var(--text-secondary)' }}>{hint}</span>
      </span>
      <textarea
        rows={5}
        value={text}
        disabled={status === 'cargando' || !canWrite}
        onChange={(e) => onChange(e.target.value)}
        placeholder={status === 'cargando' ? 'Cargando…' : 'Tus apuntes de la junta. Solo tú los ves.'}
        className="rounded-[14px] px-3 py-2.5 text-sm leading-relaxed surface-card border border-[var(--border-card)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--accent)] resize-y disabled:opacity-70"
      />
    </label>
  );
}
