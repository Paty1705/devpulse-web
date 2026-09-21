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
