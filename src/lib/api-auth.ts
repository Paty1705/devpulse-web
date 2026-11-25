// Control de acceso para las rutas /api (solo servidor). Estas rutas usan
// claves del servidor (GitHub, Gemini), así que la RLS no las protege: cada una
// tiene que comprobar quién llama antes de usar la clave.

import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseGithubRepo } from './github';

type ApiUser = { db: SupabaseClient; userId: string; isJefe: boolean };
export type ApiProject = { id: string; leader_id: string | null; repo_url: string | null };

const deny = (error: string, status: number) => ({ denied: NextResponse.json({ error }, { status }) });

// Exige una sesión válida de una cuenta aprobada y, si se pide, rol de jefe.
export async function requireUser(
  req: Request,
  options: { jefe?: boolean } = {},
): Promise<(ApiUser & { denied?: never }) | { denied: NextResponse }> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return deny('Falta la sesión. Vuelve a iniciar sesión.', 401);

  // Cliente con la sesión del usuario: aplica la RLS como si fuera él.
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return deny('Sesión inválida. Vuelve a iniciar sesión.', 401);

  const { data: me } = await db.from('profiles').select('role, status').eq('id', data.user.id).single();
  if (me?.status !== 'approved') return deny('Tu cuenta no está aprobada.', 403);

  const isJefe = me.role === 'jefe';
  if (options.jefe && !isJefe) return deny('Solo un jefe puede hacer esto.', 403);

  return { db, userId: data.user.id, isJefe };
}

// Proyectos registrados que apuntan a ese repositorio. La app solo debe tocar
// o consultar repositorios que estén ligados a un proyecto.
export async function projectsForRepo(db: SupabaseClient, owner: string, repo: string): Promise<ApiProject[]> {
  const wanted = `${owner}/${repo}`.toLowerCase();
  const { data, error } = await db.from('projects').select('id, leader_id, repo_url');
  if (error) throw new Error('No se pudieron consultar los proyectos.');
  return ((data ?? []) as ApiProject[]).filter((p) => {
    const info = p.repo_url ? parseGithubRepo(p.repo_url) : null;
    return !!info && `${info.owner}/${info.repo}`.toLowerCase() === wanted;
  });
}
