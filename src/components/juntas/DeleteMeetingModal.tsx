'use client';

import { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRecording } from '@/components/juntas/RecordingProvider';
import { meetingDateTime, type Meeting } from '@/lib/meetings';

type Props = {
  meeting: Meeting;
  onClose: () => void;
  onDeleted: () => void;
};

/**
 * Borra los audios de la junta y después la junta. La base de datos se lleva
 * con ella asistentes, minuta, notas y propuestas; las tareas creadas quedan.
 */
async function deleteMeeting(meetingId: string): Promise<string | null> {
  const bucket = supabase.storage.from('meeting-recordings');
  // Una junta puede tener varios audios (cada "Grabar de nuevo" sube otro).
  const { data: files, error: listErr } = await bucket.list(meetingId, { limit: 1000 });
  if (listErr) return 'No se pudieron revisar las grabaciones. La junta no se eliminó.';
  const paths = files.map((f) => `${meetingId}/${f.name}`);
  if (paths.length) {
    const { data: removed, error: removeErr } = await bucket.remove(paths);
    if (removeErr || removed.length < paths.length) return 'No se pudieron borrar las grabaciones. La junta no se eliminó.';
  }
  // Sin permiso, Supabase no marca error: solo no borra ninguna fila.
  const { data: gone, error } = await supabase.from('meetings').delete().eq('id', meetingId).select('id');
  if (error || !gone?.length) {
    return paths.length
      ? 'Las grabaciones se borraron, pero la junta no. Inténtalo de nuevo.'
      : 'No se pudo eliminar la junta.';
  }
  return null;
}

export function DeleteMeetingModal({ meeting, onClose, onDeleted }: Props) {
  const { jobs, dismiss } = useRecording();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stage = jobs[meeting.id]?.stage;
  const busy = stage === 'subiendo' || stage === 'procesando';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !deleting && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleting, onClose]);

  const remove = async () => {
    setError(null);
    setDeleting(true);
    const failure = await deleteMeeting(meeting.id).catch(() => 'No se pudo eliminar la junta. Revisa tu conexión.');
    if (failure) {
      setDeleting(false);
      setError(failure);
      return;
    }
    dismiss(meeting.id);
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up" onMouseDown={(e) => e.target === e.currentTarget && !deleting && onClose()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="delete-meeting-title" className="bg-[var(--bg-solid,var(--bg-card))] border border-[var(--border-card)] rounded-[24px] shadow-[var(--shadow-hover)] w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 flex justify-between items-center border-b border-[var(--border-column)]">
          <h2 id="delete-meeting-title" className="text-xl font-bold text-[var(--text-primary)]">Eliminar junta</h2>
          <button onClick={onClose} disabled={deleting} aria-label="Cerrar" className="p-2 rounded-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm text-[var(--text-primary)]">
          <p>
            <span className="block font-semibold break-words">{meeting.title}</span>
            <span className="block text-[var(--text-secondary)] first-letter:uppercase">{meetingDateTime.format(new Date(meeting.scheduled_at))}</span>
          </p>
          <p className="text-[var(--text-secondary)] leading-relaxed">
            Se borran para siempre sus grabaciones, la transcripción, la minuta, las notas de todos los asistentes y las tareas propuestas.
            Las tareas que ya se aceptaron se quedan en el tablero. <strong>No se puede deshacer.</strong>
          </p>
          {busy && <p role="status">Su grabación todavía se está procesando. Espera a que termine para eliminarla.</p>}
          {error && <p role="alert" className="text-red-500">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-[var(--border-column)] flex justify-end gap-3">
          <button onClick={onClose} disabled={deleting} autoFocus className="min-h-11 px-4 rounded-[12px] text-sm font-semibold chip-glass border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={remove} disabled={deleting || busy} className="min-h-11 px-5 rounded-[12px] text-sm font-semibold inline-flex items-center gap-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white disabled:opacity-50">
            <Trash2 size={15} /> {deleting ? 'Eliminando…' : 'Eliminar para siempre'}
          </button>
        </div>
      </div>
    </div>
  );
}
