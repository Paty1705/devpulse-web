// Tipos y utilidades compartidas del módulo de Juntas.
// Tablas: meetings, meeting_attendees, meeting_minute_items y
// meeting_task_proposals (ver supabase/area_personalizacion.sql).

export type MeetingStatus = 'programada' | 'en_curso' | 'terminada' | 'cancelada';
export type AiStatus = 'sin_grabacion' | 'procesando' | 'listo' | 'error';
export type MinuteKind = 'tema' | 'acuerdo' | 'pendiente';
export type ProposalStatus = 'pendiente' | 'aceptada' | 'descartada';
export type Priority = 'Baja' | 'Media' | 'Alta' | 'Crítica';

export type Meeting = {
  id: string;
  title: string;
  scheduled_at: string;
  started_at: string | null;
  ended_at: string | null;
  status: MeetingStatus;
  review_from: string | null;
  notes: string;
  recording_path: string | null;
  transcript: string | null;
  ai_status: AiStatus;
  ai_error: string | null;
};

export type PersonRef = { id: string; email: string };

export type MinuteItem = {
  id: string;
  meeting_id: string;
  kind: MinuteKind;
  content: string;
  position: number;
  created_by: string | null;
};

export type Proposal = {
  id: string;
  meeting_id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  assigned_to: string | null;
  priority: Priority;
  due_date: string | null;
  test_date: string | null;
  source_quote: string | null;
  source: 'ia' | 'manual';
  status: ProposalStatus;
  task_id: string | null;
};

export const STATUS_LABEL: Record<MeetingStatus, string> = {
  programada: 'Programada',
  en_curso: 'En curso',
  terminada: 'Terminada',
  cancelada: 'Cancelada',
};

export const MINUTE_LABEL: Record<MinuteKind, string> = {
  tema: 'Temas tratados',
  acuerdo: 'Acuerdos',
  pendiente: 'Pendientes',
};

export const PRIORITIES: Priority[] = ['Baja', 'Media', 'Alta', 'Crítica'];

export function initials(email?: string | null) {
  if (!email) return '?';
  return (email.split('@')[0].replace(/[^a-zA-Z]/g, '').slice(0, 2) || '?').toUpperCase();
}

export function shortName(email?: string | null) {
  return email ? email.split('@')[0] : '—';
}

export const meetingDateTime = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
});

const dateOnlyFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

/** Fecha sin hora (YYYY-MM-DD) en hora local, para que no se corra un día. */
export function formatDateOnly(value: string | null) {
  if (!value) return '—';
  const [y, m, d] = value.split('-').map(Number);
  return dateOnlyFormat.format(new Date(y, m - 1, d));
}

/** YYYY-MM-DD en hora local. */
export function toDateInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Valor para <input type="datetime-local"> en hora local. */
export function toDateTimeInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${toDateInput(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function prioStyle(priority: string | null | undefined): React.CSSProperties {
  const key = priority === 'Alta' || priority === 'Crítica' ? 'alta' : priority === 'Baja' ? 'baja' : 'media';
  return { background: `var(--prio-${key}-bg)`, color: `var(--prio-${key}-text)` };
}

export function statusStyle(status: MeetingStatus): React.CSSProperties {
  switch (status) {
    case 'en_curso':
      return { background: 'var(--prio-alta-bg)', color: 'var(--prio-alta-text)' };
    case 'terminada':
      return { background: 'var(--prio-baja-bg)', color: 'var(--prio-baja-text)' };
    case 'cancelada':
      return { background: 'var(--bg-page)', color: 'var(--text-secondary)' };
    default:
      return { background: 'var(--badge-bg)', color: 'var(--badge-text)' };
  }
}
