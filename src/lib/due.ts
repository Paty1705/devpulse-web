// Hora de entrega de las tareas (tasks.due_date es fecha y hora).

/** "15:00" en hora local; vacío si es al final del día (23:59 = sin hora). */
export function dueTimeLabel(iso: string) {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return time === '23:59' ? '' : time;
}

/** " · 15:00", para agregar después de la fecha. */
export function dueTimeSuffix(iso: string) {
  const time = dueTimeLabel(iso);
  return time ? ` · ${time}` : '';
}

export function isPastDue(iso: string) {
  return new Date(iso).getTime() < Date.now();
}
