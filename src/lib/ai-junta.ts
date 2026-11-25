// Procesa una junta en dos pasos: primero transcribe el audio y después
// busca las tareas en el texto. En una sola llamada la IA llegaba a devolver
// la transcripción completa y ninguna tarea.
import { SchemaType, type GenerationConfig, type GoogleGenerativeAI, type Part, type ResponseSchema } from '@google/generative-ai';
import { asData, DATA_RULE } from './ai-safety';

const MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
// Tiempo máximo (ms) de cada intento, en el mismo orden que MODELS. Una
// llamada puede quedarse colgada y el servidor corta todo a los 300 s: la
// suma de los cuatro intentos (260 s) debe quedar por debajo.
const TRANSCRIBE_TIMEOUTS = [150_000, 70_000];
const EXTRACT_TIMEOUTS = [20_000, 20_000];
export const PRIORITIES = ['Baja', 'Media', 'Alta', 'Crítica'] as const;

export type AiProposal = {
  title: string;
  description?: string | null;
  assignee_email?: string | null;
  project_name?: string | null;
  priority?: string | null;
  due_date?: string | null;
  test_date?: string | null;
  quote?: string | null;
};

export type MeetingContext = {
  title: string;
  /** Fecha de la junta, en texto y en YYYY-MM-DD. */
  dateLabel: string;
  isoDate: string;
  attendees: { email: string; role: string }[];
  projects: { name: string; leaderEmail: string | null }[];
  minutes: { kind: string; content: string }[];
};

const proposalsSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
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
  required: ['proposals'],
};

/** Prueba los modelos en orden y devuelve el texto del primero que responda. */
async function generate(genAI: GoogleGenerativeAI, parts: Part[], generationConfig: GenerationConfig, timeouts: number[]) {
  let lastError: unknown = null;
  for (const [i, name] of MODELS.entries()) {
    try {
      const result = await genAI.getGenerativeModel({ model: name, generationConfig }, { timeout: timeouts[i] }).generateContent(parts);
      const text = result.response.text().trim();
      if (text) return text;
      lastError = new Error('respuesta vacía');
    } catch (e) {
      lastError = e;
    }
    console.warn(`procesar-junta: falló ${name}`, lastError instanceof Error ? lastError.message : lastError);
  }
  throw new Error(`Gemini no respondió: ${lastError instanceof Error ? lastError.message : 'error desconocido'}`);
}

export function transcribeMeeting(genAI: GoogleGenerativeAI, audio: Part, ctx: MeetingContext) {
  const prompt = `Transcribe completa, en español, la grabación de la junta "${ctx.title}" del ${ctx.dateLabel}.
Si puedes identificar quién habla, empieza cada intervención con su nombre.
Devuelve únicamente la transcripción, sin comentarios ni resumen.`;
  return generate(genAI, [audio, { text: prompt }], { temperature: 0.2 }, TRANSCRIBE_TIMEOUTS);
}

export async function extractProposals(genAI: GoogleGenerativeAI, transcript: string, ctx: MeetingContext): Promise<AiProposal[]> {
  const prompt = `Eres el asistente de juntas de un área de ingeniería de software.
Abajo está la transcripción de la junta "${ctx.title}" del ${ctx.dateLabel} (${ctx.isoDate}).

Extrae TODAS las tareas, compromisos y pendientes que se asignaron o acordaron. Cuenta también los que se dicen de forma informal ("hay que…", "tenemos que…", "falta…", "tomar en cuenta…"), aunque no tengan responsable ni fecha. La transcripción es automática: puede tener errores y los nombres de quien habla pueden estar mal. Para cada tarea:
- "title": corto y accionable (máx. 70 caracteres), empezando con verbo.
- "description": detalle útil de lo que se pidió, o null.
- "assignee_email": el correo de la persona responsable, SOLO de la lista de asistentes; null si no queda claro.
- "project_name": el nombre EXACTO de uno de los proyectos de la lista; null si no queda claro.
- "priority": "Baja", "Media", "Alta" o "Crítica" según la urgencia que se expresó (por defecto "Media").
- "due_date": fecha límite en formato YYYY-MM-DD si se mencionó (convierte expresiones como "el viernes" o "la próxima semana" tomando como referencia la fecha de la junta); null si no.
- "test_date": fecha de prueba YYYY-MM-DD si se mencionó; null si no.
- "quote": la frase textual de la transcripción de donde sale la tarea.
No inventes tareas que no se mencionaron. Si no hubo ninguna, devuelve una lista vacía.

${DATA_RULE}

Asistentes (correo · rol):
${ctx.attendees.map((a) => `- ${a.email} · ${a.role}`).join('\n') || '- (sin asistentes registrados)'}

Proyectos (nombre · responsable). Cada proyecto es individual: sus tareas son de su responsable.
${ctx.projects.map((p) => `- ${p.name} · ${p.leaderEmail ?? 'sin responsable'}`).join('\n') || '- (sin proyectos)'}

Minuta escrita durante la junta (puede ayudarte a entender el contexto):
${asData(ctx.minutes.map((m) => `- [${m.kind}] ${m.content}`).join('\n') || '- (vacía)')}

Transcripción:
${asData(transcript)}`;

  const raw = await generate(genAI, [{ text: prompt }], { responseMimeType: 'application/json', responseSchema: proposalsSchema, temperature: 0.2 }, EXTRACT_TIMEOUTS);
  try {
    const parsed = JSON.parse(raw.replace(/```json\n?|```\n?/g, '').trim()) as { proposals?: AiProposal[] };
    return parsed.proposals ?? [];
  } catch {
    throw new Error('La IA no devolvió un JSON válido.');
  }
}
