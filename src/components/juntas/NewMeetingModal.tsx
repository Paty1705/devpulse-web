'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';
import { toDateInput, toDateTimeInput } from '@/lib/meetings';
import { Avatar } from '@/components/juntas/Avatar';

type Person = { id: string; email: string; role: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (meetingId: string) => void;
};

function nextHalfHour() {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return d;
}

const inputClass =
  'w-full min-h-11 rounded-[12px] px-3 text-sm surface-card border border-[var(--border-card)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';

export function NewMeetingModal({ isOpen, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [title, setTitle] = useState('Seguimiento semanal del área');
  const [when, setWhen] = useState(() => toDateTimeInput(nextHalfHour()));
  const [reviewFrom, setReviewFrom] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const [{ data: profs }, { data: last }] = await Promise.all([
        supabase.from('profiles').select('id, email, role').eq('status', 'approved').order('email'),
        supabase.from('meetings').select('scheduled_at').eq('status', 'terminada').order('scheduled_at', { ascending: false }).limit(1),
      ]);
      if (cancelled) return;
      const list = (profs ?? []) as Person[];
      setPeople(list);
      setSelected(new Set(list.map((p) => p.id)));
      // Por defecto se revisan los avances desde la junta anterior (o 7 días).
      const from = last?.[0]?.scheduled_at ? new Date(last[0].scheduled_at) : new Date(Date.now() - 7 * 864e5);
      setReviewFrom(toDateInput(from));
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const save = async () => {
    if (!title.trim() || !when) {
      setError('Pon un título y la fecha de la junta.');
      return;
    }
    if (selected.size === 0) {
      setError('Elige al menos un asistente.');
      return;
    }
    setSaving(true);
    setError(null);
    const { data: meeting, error: err } = await supabase
      .from('meetings')
      .insert({ title: title.trim(), scheduled_at: new Date(when).toISOString(), review_from: reviewFrom || null })
      .select('id')
      .single();
    if (err || !meeting) {
      setSaving(false);
      setError('No se pudo crear la junta. Solo un jefe puede crearlas.');
      return;
    }
    const attendees = [...selected].map((id) => ({ meeting_id: meeting.id, user_id: id }));
    const { error: attErr } = await supabase.from('meeting_attendees').insert(attendees);
    setSaving(false);
    if (attErr) {
      setError('La junta se creó, pero no se pudieron guardar los asistentes.');
      return;
    }
    onCreated(meeting.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up">
      <div role="dialog" aria-modal="true" aria-labelledby="new-meeting-title" className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[24px] shadow-[var(--shadow-hover)] w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 flex justify-between items-center border-b border-[var(--border-column)]">
          <h2 id="new-meeting-title" className="text-xl font-bold text-[var(--text-primary)]">Nueva junta</h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Fecha y hora</span>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Revisar avances desde</span>
              <input type="date" value={reviewFrom} onChange={(e) => setReviewFrom(e.target.value)} className={inputClass} />
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-[var(--text-primary)] mb-1.5 flex justify-between w-full">
              <span>Asistentes</span>
              <span className="font-mono text-xs text-[var(--text-secondary)]">{selected.size} de {people.length}</span>
            </legend>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {people.map((p) => {
                const on = selected.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    aria-pressed={on}
                    className={`w-full flex items-center gap-3 p-2 rounded-[14px] border transition-colors text-left ${on ? 'border-[var(--accent)] chip-glass' : 'border-[var(--border-card)] hover:bg-[var(--bg-card-hover)]'}`}
                  >
                    <Avatar email={p.email} highlight={p.id === user?.id} size={32} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">{p.email}</span>
                      <span className="block font-mono text-[11px] text-[var(--text-secondary)]">{p.role}</span>
                    </span>
                    <span className={`w-6 h-6 rounded-[8px] flex items-center justify-center ${on ? 'nav-active' : 'border border-[var(--border-card)]'}`}>
                      {on && <Check size={14} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-[var(--border-column)] flex justify-end gap-3">
          <button onClick={onClose} className="min-h-11 px-4 rounded-[12px] text-sm font-semibold chip-glass border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]">
            Cancelar
          </button>
          <button onClick={save} disabled={saving} className="nav-active min-h-11 px-5 rounded-[12px] text-sm font-semibold disabled:opacity-60">
            {saving ? 'Creando…' : 'Crear junta'}
          </button>
        </div>
      </div>
    </div>
  );
}
