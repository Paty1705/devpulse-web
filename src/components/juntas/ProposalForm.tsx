'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PRIORITIES, prioStyle, splitAssignees, toDateInput, type PersonRef, type Priority } from '@/lib/meetings';
import { PeoplePicker } from '@/components/PeoplePicker';

type Props = {
  meetingId: string;
  currentUserId: string;
  /** Proyectos que lidera quien propone. */
  projects: { id: string; name: string }[];
  attendees: PersonRef[];
  fieldClass: string;
  onSent: () => void;
  onCancel: () => void;
};

/** Propuesta de un asistente: nada se guarda hasta que la envía completa. */
export function ProposalForm({ meetingId, currentUserId, projects, attendees, fieldClass, onSent, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState<Priority>('Media');
  const [dueDate, setDueDate] = useState('');
  const [testDate, setTestDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [people, setPeople] = useState([currentUserId]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Escribe qué quieres hacer.');
      return;
    }
    setSending(true);
    setError(null);
    const { error: err } = await supabase.from('meeting_task_proposals').insert({
      meeting_id: meetingId,
      title: title.trim(),
      description: description.trim() || null,
      project_id: projectId || null,
      ...splitAssignees(people, [currentUserId]),
      priority,
      due_date: dueDate,
      due_time: dueTime || null,
      test_date: testDate || null,
      source: 'manual',
      created_by: currentUserId,
    });
    setSending(false);
    if (err) setError('No se pudo enviar la propuesta. Inténtalo de nuevo.');
    else onSent();
  };

  return (
    <form onSubmit={submit} className="chip-glass rounded-[18px] p-3.5 border border-[var(--accent)] grid grid-cols-2 gap-2">
      <h3 className="col-span-2 text-sm font-semibold text-[var(--text-primary)]">Proponer una tarea</h3>
      <label className="col-span-2 flex flex-col gap-1">
        <span className="text-xs text-[var(--text-secondary)]">¿Qué quieres hacer?</span>
        <input name="title" autoFocus required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Rediseñar la pantalla de inicio" className={fieldClass} />
      </label>
      <label className="col-span-2 flex flex-col gap-1">
        <span className="text-xs text-[var(--text-secondary)]">Explicación (opcional)</span>
        <textarea name="description" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="En qué consiste, para qué sirve, qué vas a entregar…" className={`${fieldClass} py-2 resize-y`} />
      </label>
      <label className="col-span-2 flex flex-col gap-1">
        <span className="text-xs text-[var(--text-secondary)]">Proyecto</span>
        <select name="project_id" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={fieldClass}>
          <option value="">Sin proyecto</option>
          {projects.length > 0 && (
            <optgroup label="Mis proyectos">
              {projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      <div className="col-span-2">
        <PeoplePicker legend="Responsables" people={attendees} selected={people} onChange={setPeople} lockedId={currentUserId} />
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--text-secondary)]">Fecha de entrega</span>
        <input name="due_date" type="date" required min={toDateInput(new Date())} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--text-secondary)]">Hora de entrega (opcional)</span>
        <input name="due_time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--text-secondary)]">Prioridad</span>
        <select name="priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={fieldClass} style={prioStyle(priority)}>
          {PRIORITIES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--text-secondary)]">Fecha de prueba (opcional)</span>
        <input name="test_date" type="date" min={toDateInput(new Date())} value={testDate} onChange={(e) => setTestDate(e.target.value)} className={fieldClass} />
      </label>
      {error && <p role="alert" className="col-span-2 text-sm text-red-500">{error}</p>}
      <button type="submit" disabled={sending} className="nav-active min-h-10 rounded-[12px] text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar al jefe
      </button>
      <button type="button" onClick={onCancel} disabled={sending} className="min-h-10 rounded-[12px] text-[13px] font-semibold surface-card border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]">
        Cancelar
      </button>
    </form>
  );
}
