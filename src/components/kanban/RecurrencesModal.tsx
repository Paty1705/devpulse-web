'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pause, Play, Repeat, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';
import { prioStyle, shortName } from '@/lib/meetings';
import { describeRecurrence, formatShort, upcoming, type Recurrence } from '@/lib/recurrence';

type Row = Recurrence & {
  assignee: { email: string } | null;
  project: { name: string; leader_id: string | null } | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Se llama cuando un cambio pudo generar tareas nuevas. */
  onChanged: () => void;
};

export function RecurrencesModal({ isOpen, onClose, onChanged }: Props) {
  const { user, profile } = useAuth();
  const isJefe = profile?.role === 'jefe';
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('task_recurrences')
      .select('*, assignee:profiles!task_recurrences_assigned_to_fkey(email), project:projects(name, leader_id)')
      .order('active', { ascending: false })
      .order('next_run', { ascending: true });
    if (err) setError('No se pudieron cargar las repeticiones.');
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      await load();
    })();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, load, onClose]);

  if (!isOpen) return null;

  const canManage = (r: Row) =>
    isJefe || (!!r.project && r.project.leader_id === user?.id) || (!r.project_id && r.assigned_to === user?.id);

  // El jefe ve todas; los demás, las suyas y las de proyectos que lideran.
  const visible = rows.filter((r) => isJefe || r.assigned_to === user?.id || canManage(r));

  const toggle = async (r: Row) => {
    setError(null);
    const { error: err } = await supabase.from('task_recurrences').update({ active: !r.active }).eq('id', r.id);
    if (err) setError('No se pudo cambiar la repetición.');
    await load();
    onChanged();
  };

  const remove = async (r: Row) => {
    setError(null);
    setConfirming(null);
    const { error: err } = await supabase.from('task_recurrences').delete().eq('id', r.id);
    if (err) setError('No se pudo borrar la repetición.');
    await load();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="recurrences-title" className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[24px] shadow-[var(--shadow-hover)] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 flex justify-between items-center border-b border-[var(--border-column)]">
          <div>
            <h2 id="recurrences-title" className="text-xl font-bold text-[var(--text-primary)]">Tareas repetitivas</h2>
            <p className="text-xs text-[var(--text-secondary)]">Cada una se crea sola en el tablero cuando le toca, a las 00:05.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex flex-col gap-3">
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          {loading ? (
            <p className="text-sm text-[var(--text-secondary)]">Cargando…</p>
          ) : visible.length === 0 ? (
            <div className="text-center py-8 flex flex-col items-center gap-2">
              <span className="tile-3d w-12 h-12 rounded-[16px] flex items-center justify-center" style={{ background: 'linear-gradient(150deg, var(--accent-2), var(--accent))' }}>
                <Repeat size={22} className="text-white" />
              </span>
              <p className="font-semibold text-[var(--text-primary)]">No hay tareas repetitivas.</p>
              <p className="text-sm text-[var(--text-secondary)]">Crea una desde &quot;Nueva tarea&quot; y elige cada cuánto se repite.</p>
            </div>
          ) : (
            visible.map((r) => {
              const starts = r.starts_on ?? r.next_run;
              const next = r.active ? upcoming(starts, r.frequency, r.every_n, 1, r.end_date, r.next_run)[0] : undefined;
              const manage = canManage(r);
              return (
                <article key={r.id} className={`surface-card border border-[var(--border-card)] rounded-[18px] p-4 flex flex-col gap-3 ${r.active ? '' : 'opacity-70'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[var(--text-primary)] truncate">{r.title}</h3>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {describeRecurrence(r.frequency, r.every_n, starts)}
                        {r.due_in_days > 0 && ` · ${r.due_in_days} ${r.due_in_days === 1 ? 'día' : 'días'} para terminarla`}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-[8px]" style={r.active ? { background: 'var(--prio-baja-bg)', color: 'var(--prio-baja-text)' } : { background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                      {r.active ? 'Activa' : r.end_date && r.next_run > r.end_date ? 'Terminó' : 'En pausa'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="chip-glass px-2 py-1 rounded-[8px] text-[var(--text-primary)]">{r.project?.name ?? 'Personal'}</span>
                    <span className="chip-glass px-2 py-1 rounded-[8px] text-[var(--text-primary)]">{r.assignee ? shortName(r.assignee.email) : 'Sin asignar'}</span>
                    <span className="px-2 py-1 rounded-[8px] font-semibold" style={prioStyle(r.priority)}>{r.priority}</span>
                    {next && <span className="font-mono text-[var(--text-secondary)]">siguiente: {formatShort(next)}</span>}
                    {r.end_date && <span className="font-mono text-[var(--text-secondary)]">hasta {formatShort(r.end_date)}</span>}
                  </div>
                  {manage && (
                    <div className="flex flex-wrap gap-2">
                      {!(r.end_date && r.next_run > r.end_date) && (
                        <button onClick={() => toggle(r)} className="min-h-9 px-3 rounded-[10px] text-[13px] font-semibold chip-glass border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] inline-flex items-center gap-1.5">
                          {r.active ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> Reanudar</>}
                        </button>
                      )}
                      {confirming === r.id ? (
                        <>
                          <button onClick={() => remove(r)} className="min-h-9 px-3 rounded-[10px] text-[13px] font-semibold bg-red-500/15 text-red-500 hover:bg-red-500/25">Sí, borrar</button>
                          <button onClick={() => setConfirming(null)} className="min-h-9 px-3 rounded-[10px] text-[13px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]">Cancelar</button>
                          <span className="text-xs text-[var(--text-secondary)] self-center">Las tareas ya creadas se quedan en el tablero.</span>
                        </>
                      ) : (
                        <button onClick={() => setConfirming(r.id)} className="min-h-9 px-3 rounded-[10px] text-[13px] font-semibold text-[var(--text-secondary)] hover:text-red-500 hover:bg-[var(--bg-card-hover)] inline-flex items-center gap-1.5">
                          <Trash2 size={14} /> Borrar
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
