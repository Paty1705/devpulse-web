import { supabase } from '@/lib/supabase';

/**
 * Crea un evento en el calendario principal del usuario autenticado en Supabase con Google.
 */
export async function createGoogleCalendarEvent(
  title: string, 
  description: string, 
  dueDateIso: string
) {
  try {
    // 1. Obtener la sesión actual para extraer el provider_token de Google
    const { data: { session } } = await supabase.auth.getSession();
    
    // NOTA: Para que el provider_token esté disponible, en Supabase se debe haber configurado
    // Google Provider para que devuelva el token de actualización/acceso.
    const providerToken = session?.provider_token;

    if (!providerToken) {
      console.warn("No se encontró el token de proveedor de Google. Asegúrate de haber iniciado sesión con Google y tener los scopes adecuados.");
      return null;
    }

    // 2. Construir las fechas del evento (Inicio y Fin).
    // Supondremos que la tarea dura 1 hora a partir de la fecha/hora límite, o si es todo el día
    // ajustaremos el formato. Para este caso, usamos datetime directo.
    const startDate = new Date(dueDateIso);
    
    // Si la hora es exactamente las 23:59:00, podríamos considerarlo un evento de todo el día,
    // pero para mantenerlo simple, restamos 1 hora a la fecha límite para definir la hora de trabajo final.
    const endDate = new Date(startDate.getTime());
    startDate.setHours(startDate.getHours() - 1); 

    const event = {
      summary: `[DevPulse] ${title}`,
      description: description,
      start: {
        dateTime: startDate.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };

    // 3. Llamar a la API de Google Calendar
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${providerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error al crear evento en GCalendar:", errorData);
      throw new Error("No se pudo crear el evento en el calendario.");
    }

    const data = await response.json();
    return data.id; // Retorna el google_event_id

  } catch (error) {
    console.error("Error en createGoogleCalendarEvent:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Juntas en Google Calendar: evento con invitados (les llega el correo de
// Google), enlace de Meet opcional y repetición con RRULE. Se crea en el
// calendario de quien organiza, con el token de su inicio de sesión con
// Google. Ese token solo existe si entró con Google y caduca en ~1 hora.
// ---------------------------------------------------------------------------

const CAL_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const MEETING_TZ = 'America/Mexico_City';

export type CalendarFrequency = 'diaria' | 'semanal' | 'mensual';

export type CalendarResult =
  | { ok: true; eventId: string; meetUrl: string | null }
  | { ok: false; reason: 'sin_google' | 'error'; message: string };

async function googleToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.provider_token ?? null;
}

/** ¿La sesión actual puede usar Google Calendar? */
export async function hasGoogleCalendar() {
  return !!(await googleToken());
}

/** "2026-11-16T10:00:00" en hora de CDMX, para que la repetición respete la hora local. */
function localDateTime(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MEETING_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}:${get('second')}`;
}

/** Regla de repetición equivalente a la de la app (mensual 29-31 → último día si no existe). */
export function buildRRule(frequency: CalendarFrequency, everyN: number, start: Date, endDate?: string | null) {
  const freq = { diaria: 'DAILY', semanal: 'WEEKLY', mensual: 'MONTHLY' }[frequency];
  let rule = `RRULE:FREQ=${freq};INTERVAL=${everyN}`;
  if (frequency === 'mensual') {
    const day = Number(localDateTime(start).slice(8, 10));
    if (day > 28) {
      const days = Array.from({ length: day - 27 }, (_, i) => 28 + i).join(',');
      rule += `;BYMONTHDAY=${days};BYSETPOS=-1`;
    }
  }
  if (endDate) {
    // 23:59:59 en CDMX (UTC-6) del último día = 05:59:59 UTC del día siguiente.
    const [y, m, d] = endDate.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    rule += `;UNTIL=${next.toISOString().slice(0, 10).replace(/-/g, '')}T055959Z`;
  }
  return rule;
}

async function readError(res: Response) {
  const body = await res.json().catch(() => null);
  return (body?.error?.message as string | undefined) ?? `Google respondió ${res.status}`;
}

export async function createMeetingEvent(opts: {
  title: string;
  description?: string;
  start: Date;
  durationMinutes: number;
  attendeeEmails: string[];
  withMeet: boolean;
  recurrence?: { frequency: CalendarFrequency; everyN: number; endDate?: string | null };
  reminderMinutes?: number | null;
}): Promise<CalendarResult> {
  const token = await googleToken();
  if (!token) return { ok: false, reason: 'sin_google', message: 'Para usar Google Calendar, cierra sesión y vuelve a entrar con Google.' };
  const end = new Date(opts.start.getTime() + opts.durationMinutes * 60_000);
  const event: Record<string, unknown> = {
    summary: opts.title,
    description: opts.description ?? 'Junta organizada desde DevPulse.',
    start: { dateTime: localDateTime(opts.start), timeZone: MEETING_TZ },
    end: { dateTime: localDateTime(end), timeZone: MEETING_TZ },
    attendees: opts.attendeeEmails.map((email) => ({ email })),
    reminders: opts.reminderMinutes == null
      ? { useDefault: true }
      : { useDefault: false, overrides: [{ method: 'popup', minutes: opts.reminderMinutes }] },
  };
  if (opts.recurrence) event.recurrence = [buildRRule(opts.recurrence.frequency, opts.recurrence.everyN, opts.start, opts.recurrence.endDate)];
  if (opts.withMeet) {
    event.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  }
  try {
    const res = await fetch(`${CAL_API}?sendUpdates=all&conferenceDataVersion=1`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (res.status === 401) return { ok: false, reason: 'sin_google', message: 'Tu sesión de Google caducó. Cierra sesión y vuelve a entrar con Google.' };
    if (!res.ok) return { ok: false, reason: 'error', message: await readError(res) };
    const data = await res.json();
    const meetUrl = (data.hangoutLink as string | undefined)
      ?? (data.conferenceData?.entryPoints?.find((e: { entryPointType: string; uri: string }) => e.entryPointType === 'video')?.uri as string | undefined)
      ?? null;
    return { ok: true, eventId: data.id as string, meetUrl };
  } catch {
    return { ok: false, reason: 'error', message: 'No se pudo conectar con Google Calendar.' };
  }
}

/** Cancela el evento (o solo la junta `instanceStart` si es una serie) y avisa a los invitados. */
export async function cancelMeetingEvent(eventId: string, instanceStart?: Date): Promise<boolean> {
  const token = await googleToken();
  if (!token) return false;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  try {
    let target = eventId;
    if (instanceStart) {
      const min = new Date(instanceStart.getTime() - 60_000).toISOString();
      const max = new Date(instanceStart.getTime() + 60_000).toISOString();
      const res = await fetch(`${CAL_API}/${encodeURIComponent(eventId)}/instances?timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}`, { headers });
      if (!res.ok) return false;
      const data = await res.json();
      target = data.items?.[0]?.id;
      if (!target) return false;
    }
    const res = await fetch(`${CAL_API}/${encodeURIComponent(target)}?sendUpdates=all`, { method: 'DELETE', headers });
    return res.ok || res.status === 410;
  } catch {
    return false;
  }
}

/** Termina una serie en Google: deja la última junta en `lastDate` (YYYY-MM-DD). */
export async function endRecurringEvent(eventId: string, rule: { frequency: CalendarFrequency; everyN: number; start: Date }, lastDate: string): Promise<boolean> {
  const token = await googleToken();
  if (!token) return false;
  try {
    const res = await fetch(`${CAL_API}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recurrence: [buildRRule(rule.frequency, rule.everyN, rule.start, lastDate)] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
