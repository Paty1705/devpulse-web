import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, SchemaType, type Part, type ResponseSchema } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';

// Transcribir y analizar una junta larga puede tardar; Vercel lo respeta
// (hasta 300 s en el plan Hobby con Fluid Compute).
export const maxDuration = 300;

// Hasta este tamaño el audio va dentro de la petición; más grande se sube
// primero a la Files API de Gemini (el límite de una petición es ~20 MB).
const INLINE_LIMIT_BYTES = 15 * 1024 * 1024;
const MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const PRIORITIES = ['Baja', 'Media', 'Alta', 'Crítica'] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type AiProposal = {
  title: string;
  description?: string | null;
  assignee_email?: string | null;
  project_name?: string | null;
  priority?: string | null;
  due_date?: string | null;
  test_date?: string | null;
  quote?: string | null;
};

const responseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    transcript: { type: SchemaType.STRING, description: 'Transcripción completa en español, con "Nombre:" al inicio de cada intervención cuando se pueda identificar.' },
    proposals: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING, nullable: true },
          assignee_email: { type: SchemaType.STRING, nullable: true },
          project_name: { type: SchemaType.STRING, nullable: true },
          priority: { type: SchemaType.STRING, format: 'enum', enum: [...PRIORITIES] },
          due_date: { type: SchemaType.STRING, nullable: true, description: 'YYYY-MM-DD' },
          test_date: { type: SchemaType.STRING, nullable: true, description: 'YYYY-MM-DD' },
          quote: { type: SchemaType.STRING, nullable: true },
        },
        required: ['title', 'priority'],
      },
    },
  },
  required: ['transcript', 'proposals'],
};

function geminiMime(type: string, path: string) {
  const base = type.split(';')[0].trim();
  if (base && base !== 'application/octet-stream') return base;
  if (path.endsWith('.ogg')) return 'audio/ogg';
  if (path.endsWith('.m4a') || path.endsWith('.mp4')) return 'audio/mp4';
  if (path.endsWith('.mp3')) return 'audio/mp3';
  if (path.endsWith('.wav')) return 'audio/wav';
  return 'audio/webm';
}

async function audioPart(apiKey: string, bytes: Buffer, mimeType: string, name: string): Promise<Part> {
  if (bytes.length <= INLINE_LIMIT_BYTES) {
    return { inlineData: { data: bytes.toString('base64'), mimeType } };
  }
  const files = new GoogleAIFileManager(apiKey);
  const uploaded = await files.uploadFile(bytes, { mimeType, displayName: name });
  let file = uploaded.file;
  for (let i = 0; i < 60 && file.state === FileState.PROCESSING; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    file = await files.getFile(file.name);
  }
  if (file.state !== FileState.ACTIVE) throw new Error('Gemini no pudo procesar el archivo de audio.');
  return { fileData: { fileUri: file.uri, mimeType: file.mimeType } };
}

async function markError(db: SupabaseClient, meetingId: string, message: string) {
  await db.from('meetings').update({ ai_status: 'error', ai_error: message.slice(0, 500) }).eq('id', meetingId);
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'La clave GEMINI_API_KEY no está configurada en el servidor.' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Falta la sesión.' }, { status: 401 });

  const { meetingId } = (await req.json().catch(() => ({}))) as { meetingId?: string };
  if (!meetingId) return NextResponse.json({ error: 'Falta meetingId.' }, { status: 400 });

  // Cliente con la sesión del usuario: aplica la RLS como si fuera él.
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userRes.user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });
  const { data: me } = await db.from('profiles').select('role, status').eq('id', userRes.user.id).single();
  if (me?.role !== 'jefe' || me?.status !== 'approved') {
    return NextResponse.json({ error: 'Solo un jefe puede procesar juntas.' }, { status: 403 });
  }

  try {
    const { data: meeting, error: mErr } = await db
      .from('meetings')
      .select('id, title, scheduled_at, recording_path')
      .eq('id', meetingId)
      .single();
    if (mErr || !meeting) return NextResponse.json({ error: 'La junta no existe.' }, { status: 404 });
    if (!meeting.recording_path) return NextResponse.json({ error: 'La junta no tiene grabación.' }, { status: 400 });

    await db.from('meetings').update({ ai_status: 'procesando', ai_error: null }).eq('id', meetingId);

    const [{ data: attendeeRows }, { data: projectRows }, { data: minuteRows }] = await Promise.all([
      db.from('meeting_attendees').select('user_id, profile:profiles(email, role)').eq('meeting_id', meetingId),
      db.from('projects').select('id, name, leader_id, leader:profiles!projects_leader_id_fkey(email)'),
      db.from('meeting_minute_items').select('kind, content').eq('meeting_id', meetingId).order('position'),
    ]);
    type AttRow = { user_id: string; profile: { email: string; role: string } | null };
    type ProjRow = { id: string; name: string; leader_id: string | null; leader: { email: string } | null };
    const attendees = ((attendeeRows ?? []) as unknown as AttRow[]).filter((a) => a.profile);
    const projects = (projectRows ?? []) as unknown as ProjRow[];

    const { data: audio, error: dlErr } = await db.storage.from('meeting-recordings').download(meeting.recording_path);
    if (dlErr || !audio) throw new Error('No se pudo descargar la grabación.');
    const bytes = Buffer.from(await audio.arrayBuffer());
    const mimeType = geminiMime(audio.type, meeting.recording_path);

    const meetingDate = new Date(meeting.scheduled_at);
    const dateLabel = new Intl.DateTimeFormat('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Mexico_City' }).format(meetingDate);
    const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(meetingDate);

    const prompt = `Eres el asistente de juntas de un área de ingeniería de software.
Escucha la grabación de la junta "${meeting.title}" del ${dateLabel} (${isoDate}) y:

1. Transcríbela completa en español. Si puedes identificar quién habla, empieza cada intervención con su nombre.
2. Extrae TODAS las tareas, compromisos y pendientes que se asignaron o acordaron. Para cada una:
   - "title": corto y accionable (máx. 70 caracteres), empezando con verbo.
   - "description": detalle útil de lo que se pidió, o null.
   - "assignee_email": el correo de la persona responsable, SOLO de la lista de asistentes; null si no queda claro.
   - "project_name": el nombre EXACTO de uno de los proyectos de la lista; null si no queda claro.
   - "priority": "Baja", "Media", "Alta" o "Crítica" según la urgencia que se expresó (por defecto "Media").
   - "due_date": fecha límite en formato YYYY-MM-DD si se mencionó (convierte expresiones como "el viernes" o "la próxima semana" tomando como referencia la fecha de la junta); null si no.
   - "test_date": fecha de prueba YYYY-MM-DD si se mencionó; null si no.
   - "quote": la frase textual de la grabación de donde sale la tarea.
No inventes tareas que no se mencionaron. Si no hubo ninguna, devuelve una lista vacía.

Asistentes (correo · rol):
${attendees.map((a) => `- ${a.profile!.email} · ${a.profile!.role}`).join('\n') || '- (sin asistentes registrados)'}

Proyectos (nombre · responsable). Cada proyecto es individual: sus tareas son de su responsable.
${projects.map((p) => `- ${p.name} · ${p.leader?.email ?? 'sin responsable'}`).join('\n') || '- (sin proyectos)'}

Minuta escrita durante la junta (puede ayudarte a entender el contexto):
${(minuteRows ?? []).map((m) => `- [${m.kind}] ${m.content}`).join('\n') || '- (vacía)'}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const part = await audioPart(apiKey, bytes, mimeType, `junta-${meetingId}`);

    let raw = '';
    let lastError: unknown = null;
    for (const name of MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: name,
          generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.2 },
        });
        const result = await model.generateContent([part, { text: prompt }]);
        raw = result.response.text();
        break;
      } catch (e) {
        lastError = e;
        console.warn(`procesar-junta: falló ${name}`, e instanceof Error ? e.message : e);
      }
    }
    if (!raw) throw new Error(`Gemini no respondió: ${lastError instanceof Error ? lastError.message : 'error desconocido'}`);

    let parsed: { transcript?: string; proposals?: AiProposal[] };
    try {
      parsed = JSON.parse(raw.replace(/```json\n?|```\n?/g, '').trim());
    } catch {
      throw new Error('La IA no devolvió un JSON válido.');
    }

    // Normaliza: correos/proyectos deben existir; en proyectos individuales
    // la tarea es del responsable del proyecto.
    const byEmail = new Map(attendees.map((a) => [a.profile!.email.toLowerCase(), a.user_id]));
    const byProject = new Map(projects.map((p) => [p.name.trim().toLowerCase(), p]));
    const rows = (parsed.proposals ?? [])
      .filter((p) => p && typeof p.title === 'string' && p.title.trim())
      .map((p) => {
        const project = p.project_name ? byProject.get(p.project_name.trim().toLowerCase()) : undefined;
        let assignee = p.assignee_email ? byEmail.get(p.assignee_email.trim().toLowerCase()) ?? null : null;
        let projectId = project?.id ?? null;
        if (project?.leader_id) assignee = project.leader_id;
        if (!projectId && assignee) {
          const led = projects.filter((x) => x.leader_id === assignee);
          if (led.length === 1) projectId = led[0].id;
        }
        const priority = PRIORITIES.includes(p.priority as (typeof PRIORITIES)[number]) ? p.priority : 'Media';
        return {
          meeting_id: meetingId,
          title: p.title.trim().slice(0, 140),
          description: p.description?.trim() || null,
          project_id: projectId,
          assigned_to: assignee,
          priority,
          due_date: p.due_date && DATE_RE.test(p.due_date) ? p.due_date : null,
          test_date: p.test_date && DATE_RE.test(p.test_date) ? p.test_date : null,
          source_quote: p.quote?.trim().slice(0, 500) || null,
          source: 'ia' as const,
        };
      });

    // Al volver a procesar se reemplazan solo las propuestas de IA que nadie
    // ha revisado; las aceptadas, descartadas y manuales se conservan.
    const { error: delErr } = await db
      .from('meeting_task_proposals')
      .delete()
      .eq('meeting_id', meetingId)
      .eq('source', 'ia')
      .eq('status', 'pendiente');
    if (delErr) throw new Error('No se pudieron limpiar las propuestas anteriores.');

    if (rows.length) {
      const { error: insErr } = await db.from('meeting_task_proposals').insert(rows);
      if (insErr) throw new Error('No se pudieron guardar las propuestas.');
    }

    await db
      .from('meetings')
      .update({ transcript: parsed.transcript?.trim() || null, ai_status: 'listo', ai_error: null })
      .eq('id', meetingId);

    return NextResponse.json({ proposals: rows.length }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('Error en /api/ai/procesar-junta:', error);
    await markError(db, meetingId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
