'use client';

import { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Person = { id: string; email: string };
type Work = { projects: number; tasks: number; recurrences: number };

type Props = {
  target: Person;
  /** Personas aprobadas que pueden recibir su trabajo. */
  candidates: Person[];
  onClose: () => void;
  onDeleted: () => void;
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Confirmación para eliminar una cuenta; si tiene trabajo, pide a quién pasarlo. */
export function DeleteUserModal({ target, candidates, onClose, onDeleted }: Props) {
  const [work, setWork] = useState<Work | null>(null);
  const [heir, setHeir] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase.rpc('user_pending_work', { target: target.id });
      if (cancelled) return;
      if (err) setError('No se pudo revisar qué tiene a su cargo. Cierra e intenta de nuevo.');
      else setWork(data as Work);
    })();
    return () => {
      cancelled = true;
    };
  }, [target.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !deleting && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleting, onClose]);

  const pending = work
    ? [
        work.projects && count(work.projects, 'proyecto', 'proyectos'),
        work.tasks && count(work.tasks, 'tarea', 'tareas'),
        work.recurrences && count(work.recurrences, 'tarea repetitiva', 'tareas repetitivas'),
      ].filter(Boolean)
    : [];
  const needsHeir = pending.length > 0;

  const remove = async () => {
    setError(null);
    setDeleting(true);
    const { error: err } = await supabase.rpc('delete_user', { target: target.id, heir: needsHeir ? heir : null });
    if (err) {
      setDeleting(false);
      return setError('No se pudo eliminar: ' + err.message);
    }
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up" onMouseDown={(e) => e.target === e.currentTarget && !deleting && onClose()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="delete-user-title" className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[24px] shadow-[var(--shadow-hover)] w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 flex justify-between items-center border-b border-[var(--border-column)]">
          <h2 id="delete-user-title" className="text-xl font-bold text-[var(--text-primary)]">Eliminar usuario</h2>
          <button onClick={onClose} disabled={deleting} aria-label="Cerrar" className="p-2 rounded-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm text-[var(--text-primary)]">
          <p className="font-semibold break-all">{target.email}</p>
          <p className="text-[var(--text-secondary)] leading-relaxed">
            Se borran para siempre su cuenta, su perfil, sus tareas personales, sus notas, su agenda, sus asistencias, sus avances y sus notificaciones.
            Las juntas y los recursos del equipo se conservan. <strong>No se puede deshacer.</strong>
          </p>

          {!work && !error && <p className="text-[var(--text-secondary)]">Revisando qué tiene a su cargo…</p>}

          {needsHeir && (
            <label className="block space-y-1.5">
              <span className="font-semibold">Tiene {pending.join(', ')}. ¿A quién se le pasan?</span>
              <select name="heir" value={heir} onChange={(e) => setHeir(e.target.value)} className="w-full min-h-11 rounded-[12px] px-3 surface-card border border-[var(--border-card)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
                <option value="">Elegir persona…</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.email}</option>)}
              </select>
            </label>
          )}

          {error && <p role="alert" className="text-red-500">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-[var(--border-column)] flex justify-end gap-3">
          <button onClick={onClose} disabled={deleting} autoFocus className="min-h-11 px-4 rounded-[12px] text-sm font-semibold chip-glass border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={remove} disabled={!work || deleting || (needsHeir && !heir)} className="min-h-11 px-5 rounded-[12px] text-sm font-semibold inline-flex items-center gap-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white disabled:opacity-50">
            <Trash2 size={15} /> {deleting ? 'Eliminando…' : 'Eliminar para siempre'}
          </button>
        </div>
      </div>
    </div>
  );
}
