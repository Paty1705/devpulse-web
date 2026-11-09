'use client';

import { useEffect, useState } from 'react';
import { Bell, CalendarPlus, Check, Repeat, Video, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';
import { REMINDER_OPTIONS, toDateInput, toDateTimeInput } from '@/lib/meetings';
import { describeRecurrence, formatShort, FREQUENCY_UNIT, type Frequency } from '@/lib/recurrence';
import { createMeetingEvent, hasGoogleCalendar } from '@/lib/calendar';
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

const DURATIONS = [15, 30, 45, 60, 90, 120];
const REPEATS: { value: Frequency | 'no'; label: string }[] = [
  { value: 'no', label: 'Una vez' },
  { value: 'diaria', label: 'Diaria' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensual', label: 'Mensual' },
];

/** Más de 5 minutos en el pasado. */
function isPast(d: Date) {
  return d.getTime() < Date.now() - 5 * 60_000;
}

const timeFmt = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' });

export function NewMeetingModal({ isOpen, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [title, setTitle] = useState('Seguimiento semanal del área');
  const [when, setWhen] = useState(() => toDateTimeInput(nextHalfHour()));
  const [duration, setDuration] = useState(60);
  const [reviewFrom, setReviewFrom] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [repeat, setRepeat] = useState<Frequency | 'no'>('no');
  const [everyN, setEveryN] = useState('1');
  const [endDate, setEndDate] = useState('');
  const [reminder, setReminder] = useState<number | null>(15);
  const [useCalendar, setUseCalendar] = useState(false);
  const [withMeet, setWithMeet] = useState(true);
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const [{ data: profs }, { data: last }, google] = await Promise.all([
        supabase.from('profiles').select('id, email, role').eq('status', 'approved').order('email'),
        supabase.from('meetings').select('scheduled_at').eq('status', 'terminada').order('scheduled_at', { ascending: false }).limit(1),
        hasGoogleCalendar(),
      ]);
      if (cancelled) return;
      const list = (profs ?? []) as Person[];
      setPeople(list);
      setSelected(new Set(list.map((p) => p.id)));
      setGoogleReady(google);
      setUseCalendar(google);
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

  const start = when ? new Date(when) : null;
  const n = Math.min(52, Math.max(1, Number(everyN) || 1));

  const save = async () => {
    if (!title.trim() || !start || Number.isNaN(start.getTime())) {
      setError('Pon un título y la fecha de la junta.');
      return;
    }
    if (isPast(start)) {
      setError('La fecha ya pasó. Elige una hora a futuro.');
      return;
    }
    if (selected.size === 0) {
      setError('Elige al menos un asistente.');
      return;
    }
    if (repeat !== 'no' && endDate && endDate < toDateInput(start)) {
      setError('La fecha final de la repetición es antes de la primera junta.');
      return;
    }
    setSaving(true);
    setError(null);

    let meetingId: string | null = null;
    let seriesId: string | null = null;

    if (repeat === 'no') {
      const { data: meeting, error: err } = await supabase
        .from('meetings')
        .insert({ title: title.trim(), scheduled_at: start.toISOString(), review_from: reviewFrom || null, reminder_minutes: reminder })
        .select('id')
        .single();
      if (err || !meeting) {
        setSaving(false);
        setError('No se pudo crear la junta. Solo un jefe puede crearlas.');
        return;
      }
      meetingId = meeting.id;
      const attendees = [...selected].map((id) => ({ meeting_id: meeting.id, user_id: id }));
      const { error: attErr } = await supabase.from('meeting_attendees').insert(attendees);
      if (attErr) {
        setSaving(false);
        setError('La junta se creó, pero no se pudieron guardar los asistentes.');
        return;
      }
    } else {
      // La base crea la primera junta (con sus asistentes) en cuanto se guarda la serie.
      const { data: series, error: err } = await supabase
        .from('meeting_series')
        .insert({
          title: title.trim(),
          starts_at: start.toISOString(),
          frequency: repeat,
          every_n: n,
          end_date: endDate || null,
          attendee_ids: [...selected],
          reminder_minutes: reminder,
        })
        .select('id')
        .single();
      if (err || !series) {
        setSaving(false);
        setError('No se pudo crear la junta repetida. Revisa que el script supabase/juntas_programadas.sql esté aplicado.');
        return;
      }
      seriesId = series.id;
      const { data: first } = await supabase.from('meetings').select('id').eq('series_id', series.id).order('scheduled_at').limit(1).maybeSingle();
      meetingId = first?.id ?? null;
    }

    if (useCalendar) {
      const emails = people.filter((p) => selected.has(p.id) && p.id !== user?.id).map((p) => p.email);
      const result = await createMeetingEvent({
        title: title.trim(),
        start,
        durationMinutes: duration,
        attendeeEmails: emails,
        withMeet,
        reminderMinutes: reminder,
        recurrence: repeat === 'no' ? undefined : { frequency: repeat, everyN: n, endDate: endDate || null },
      });
      if (result.ok) {
        const link = { google_event_id: result.eventId, video_url: result.meetUrl };
        if (seriesId) await supabase.from('meeting_series').update(link).eq('id', seriesId);
        if (meetingId) await supabase.from('meetings').update(seriesId ? { video_url: result.meetUrl } : link).eq('id', meetingId);
      } else {
        // La junta ya quedó creada; solo falló Google.
        setSaving(false);
        setError(`La junta se creó, pero no se pudo agregar a Google Calendar: ${result.message}`);
        if (meetingId) setTimeout(() => onCreated(meetingId!), 2500);
        return;
      }
    }

    setSaving(false);
    if (meetingId) onCreated(meetingId);
    else onClose();
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

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Fecha y hora</span>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Duración</span>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputClass}>
                {DURATIONS.map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h`.replace('.5', ':30')}</option>)}
              </select>
            </label>
          </div>

          {/* Repetición */}
          <div className="surface-card border border-[var(--border-card)] rounded-[16px] p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text-primary)] inline-flex items-center gap-2 mr-1"><Repeat size={15} /> Repetir</span>
              {REPEATS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={repeat === r.value}
                  onClick={() => setRepeat(r.value)}
                  className={`min-h-9 px-3 rounded-[10px] text-[13px] font-semibold border transition-colors ${repeat === r.value ? 'nav-active border-transparent' : 'border-[var(--border-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {repeat !== 'no' && start && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-[var(--text-secondary)]">Cada</span>
                    <span className="flex items-center gap-2">
                      <input type="number" min={1} max={52} value={everyN} onChange={(e) => setEveryN(e.target.value)} className={inputClass.replace('w-full', 'w-20')} />
                      <span className="text-sm text-[var(--text-secondary)]">{FREQUENCY_UNIT[repeat][n === 1 ? 0 : 1]}</span>
                    </span>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-[var(--text-secondary)]">Hasta (opcional)</span>
                    <input type="date" value={endDate} min={toDateInput(start)} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
                  </label>
                </div>
                <p className="text-[13px] text-[var(--text-primary)]">
                  <strong>{describeRecurrence(repeat, n, toDateInput(start))}</strong> a las {timeFmt.format(start)}
                  {endDate ? `, hasta el ${formatShort(endDate)}.` : timeFmt.format(start).endsWith('.') ? '' : '.'}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Siempre queda creada la siguiente junta; cuando termina, aparece la próxima. Los avances se revisan desde la junta anterior.
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5"><Bell size={14} /> Recordatorio</span>
              <select value={reminder ?? ''} onChange={(e) => setReminder(e.target.value === '' ? null : Number(e.target.value))} className={inputClass}>
                {REMINDER_OPTIONS.map((o) => <option key={o.label} value={o.value ?? ''}>{o.label}</option>)}
              </select>
            </label>
            {repeat === 'no' && (
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Revisar avances desde</span>
                <input type="date" value={reviewFrom} onChange={(e) => setReviewFrom(e.target.value)} className={inputClass} />
              </label>
            )}
          </div>

          {/* Google Calendar */}
          <div className="surface-card border border-[var(--border-card)] rounded-[16px] p-4 space-y-2">
            <label className={`flex items-start gap-3 ${googleReady === false ? 'opacity-60' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={useCalendar}
                disabled={!googleReady}
                onChange={(e) => setUseCalendar(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5"><CalendarPlus size={15} /> Agregar a Google Calendar</span>
                <span className="block text-xs text-[var(--text-secondary)]">
                  {googleReady === false
                    ? 'Disponible si entras con Google. Cierra sesión y vuelve a entrar con Google para activarlo.'
                    : 'Se crea en tu calendario e invita por correo a los asistentes.'}
                </span>
              </span>
            </label>
            {useCalendar && (
              <label className="flex items-center gap-3 pl-7 cursor-pointer">
                <input type="checkbox" checked={withMeet} onChange={(e) => setWithMeet(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
                <span className="text-sm text-[var(--text-primary)] inline-flex items-center gap-1.5"><Video size={14} /> Con enlace de Google Meet</span>
              </label>
            )}
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
            {saving ? 'Creando…' : repeat === 'no' ? 'Crear junta' : 'Crear juntas'}
          </button>
        </div>
      </div>
    </div>
  );
}
