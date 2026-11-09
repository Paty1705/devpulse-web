// Tareas repetitivas (tabla task_recurrences; ver supabase/tareas_repetitivas.sql).
// El cálculo de fechas replica public.next_occurrence() para mostrar una
// vista previa idéntica a lo que va a generar la base.

export type Frequency = 'diaria' | 'semanal' | 'mensual';

export type Recurrence = {
  id: string;
  project_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  item_type: string;
  priority: string;
  frequency: Frequency;
  every_n: number;
  due_in_days: number;
  starts_on: string | null;
  next_run: string;
  end_date: string | null;
  active: boolean;
  created_by: string | null;
};

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** YYYY-MM-DD → Date local (sin que se corra un día por la zona horaria). */
export function parseDate(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Suma meses al ancla recortando al último día del mes (como Postgres). */
function addMonths(anchor: Date, months: number) {
  const target = new Date(anchor.getFullYear(), anchor.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(anchor.getDate(), last));
  return target;
}

/** Primera repetición en o después de `after`, contada desde el ancla. */
export function nextOccurrence(startsOn: string, frequency: Frequency, everyN: number, after: string) {
  const start = parseDate(startsOn);
  const from = parseDate(after);
  if (from <= start) return startsOn;
  if (frequency !== 'mensual') {
    const step = everyN * (frequency === 'semanal' ? 7 : 1);
    const diff = Math.round((from.getTime() - start.getTime()) / 864e5);
    const k = Math.ceil(diff / step);
    const d = new Date(start);
    d.setDate(d.getDate() + k * step);
    return toISODate(d);
  }
  let k = 0;
  let d = start;
  while (d < from) {
    k += 1;
    d = addMonths(start, k * everyN);
  }
  return toISODate(d);
}

/** Próximas `count` fechas a partir de hoy (o del inicio, si es futuro). */
export function upcoming(startsOn: string, frequency: Frequency, everyN: number, count: number, endDate?: string | null, from?: string) {
  const out: string[] = [];
  let cursor = nextOccurrence(startsOn, frequency, everyN, from ?? toISODate(new Date()));
  while (out.length < count && (!endDate || cursor <= endDate)) {
    out.push(cursor);
    const next = parseDate(cursor);
    next.setDate(next.getDate() + 1);
    cursor = nextOccurrence(startsOn, frequency, everyN, toISODate(next));
  }
  return out;
}

/** "Cada semana, los lunes", "Cada 2 días", "Cada mes, el día 15". */
export function describeRecurrence(frequency: Frequency, everyN: number, startsOn: string) {
  const start = parseDate(startsOn);
  if (frequency === 'diaria') return everyN === 1 ? 'Todos los días' : `Cada ${everyN} días`;
  if (frequency === 'semanal') {
    const day = WEEKDAYS[start.getDay()];
    return everyN === 1 ? `Cada semana, los ${day}` : `Cada ${everyN} semanas, en ${day}`;
  }
  const dom = start.getDate();
  return `${everyN === 1 ? 'Cada mes' : `Cada ${everyN} meses`}, el día ${dom}${dom > 28 ? ' (o el último del mes)' : ''}`;
}

const short = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
export function formatShort(value: string) {
  return short.format(parseDate(value));
}

export const FREQUENCY_UNIT: Record<Frequency, [string, string]> = {
  diaria: ['día', 'días'],
  semanal: ['semana', 'semanas'],
  mensual: ['mes', 'meses'],
};
