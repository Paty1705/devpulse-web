import { supabase } from './supabase';

// POST a una ruta /api con la sesión actual. getSession() renueva el token si
// ya venció; sin sesión, el servidor responde 401 con su propio mensaje.
export async function apiPost(path: string, body: unknown): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
