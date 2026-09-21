import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Instanciar el cliente usando la clave de entorno
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'La clave de API GEMINI_API_KEY no está configurada en el servidor.' },
        { status: 500 }
      );
    }

    const { spec } = await req.json();

    if (!spec || spec.trim() === '') {
      return NextResponse.json({ error: 'La especificación está vacía' }, { status: 400 });
    }

    const prompt = `Eres un Product Manager Técnico y Arquitecto de Software experto.
Tu trabajo es analizar las siguientes especificaciones en bruto de un proyecto y extraer una lista de tareas atómicas (backlog) listas para un tablero Kanban.

Para cada tarea debes determinar:
1. "title": Un título corto, claro y técnico (máximo 60 caracteres).
2. "description": Una descripción concisa del trabajo a realizar.
3. "itemType": El tipo de tarea, DEBE ser exactamente una de estas opciones: "Feature", "Bug", "Base de Datos", "Refactor".
4. "priority": La prioridad, DEBE ser exactamente una de estas opciones: "Baja", "Media", "Alta", "Crítica".
5. "acceptanceCriteria": Un array de strings con los criterios de aceptación (Definition of Done) para esta tarea (máximo 3).

Responde ÚNICAMENTE con un array en formato JSON válido. Nada de markdown, nada de texto introductorio, solo el array JSON.

Especificaciones del proyecto:
"""
${spec}
"""
`;

    let responseText = '';
    
    try {
      // Usar gemini-3.6-flash pero con configuración de reintentos internos si es posible
      const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
      const result = await model.generateContent(prompt);
      responseText = result.response.text();
    } catch (primaryError: any) {
      console.warn(`Error con gemini-3.6-flash, intentando obtener un modelo dinámico...`, primaryError.message);
      
      try {
        // Obtenemos un modelo distinto si está disponible
        const model = genAI.getGenerativeModel({ model: 'gemini-3.6-pro' });
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
      } catch (fallbackError: any) {
        throw new Error(`Los servidores de IA están saturados en este momento. Por favor, intenta de nuevo en unos minutos. (Asegúrate de no hacer muchos clics seguidos). Detalle: ${primaryError.message}`);
      }
    }
    
    // Intentar limpiar el texto si Gemini añadió bloques de markdown (ej. ```json ... ```)
    const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let tasks = [];
    try {
      tasks = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("Error al parsear la respuesta de Gemini:", responseText);
      return NextResponse.json({ error: 'La IA no devolvió un JSON válido.' }, { status: 500 });
    }

    return NextResponse.json({ tasks }, { status: 200 });
    
  } catch (error: any) {
    console.error("Error en API /api/ai/generate-tasks:", error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
