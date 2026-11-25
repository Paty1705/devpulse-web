import { NextResponse } from 'next/server';
import { projectsForRepo, requireUser } from '@/lib/api-auth';
import { parseGithubRepo } from '@/lib/github';

const GITHUB_API = 'https://api.github.com';

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req, { jefe: true });
    if (auth.denied) return auth.denied;

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'GITHUB_TOKEN no está configurado en el servidor.' }, { status: 500 });
    }

    const { repoUrl } = await req.json();
    if (!repoUrl) {
      return NextResponse.json({ error: 'Falta repoUrl.' }, { status: 400 });
    }

    const repoInfo = parseGithubRepo(repoUrl);
    if (!repoInfo) {
      return NextResponse.json({ error: 'La URL del repositorio no es un repositorio de GitHub válido.' }, { status: 400 });
    }
    const { owner, repo } = repoInfo;

    if (!(await projectsForRepo(auth.db, owner, repo)).length) {
      return NextResponse.json({ error: 'Ese repositorio no pertenece a ningún proyecto.' }, { status: 403 });
    }

    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    // 404: el repo ya no existe — tratamos como éxito (idempotente).
    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({}));
      const hint = res.status === 403 ? ' (el token necesita el scope "delete_repo")' : '';
      return NextResponse.json({ error: `No se pudo borrar el repositorio: ${err.message || res.statusText}${hint}` }, { status: res.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
