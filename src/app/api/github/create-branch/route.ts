import { NextResponse } from 'next/server';
import { projectsForRepo, requireUser } from '@/lib/api-auth';
import { parseGithubRepo } from '@/lib/github';

const GITHUB_API = 'https://api.github.com';

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth.denied) return auth.denied;

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'GITHUB_TOKEN no está configurado en el servidor.' }, { status: 500 });
    }

    const { repoUrl, branchName } = await req.json();
    if (!repoUrl || !branchName) {
      return NextResponse.json({ error: 'Falta repoUrl o branchName.' }, { status: 400 });
    }

    // Solo ramas de tareas, con el formato de branchNameForTask().
    if (typeof branchName !== 'string' || !/^feature\/TASK-[a-z0-9-]+$/i.test(branchName)) {
      return NextResponse.json({ error: 'El nombre de la rama no es válido.' }, { status: 400 });
    }

    const repoInfo = parseGithubRepo(repoUrl);
    if (!repoInfo) {
      return NextResponse.json({ error: 'La URL del repositorio no es un repositorio de GitHub válido.' }, { status: 400 });
    }
    const { owner, repo } = repoInfo;

    // Puede crear ramas el jefe, quien lidera el proyecto, sus miembros o
    // quien tenga una tarea asignada en él.
    const projects = await projectsForRepo(auth.db, owner, repo);
    if (!projects.length) {
      return NextResponse.json({ error: 'Ese repositorio no pertenece a ningún proyecto.' }, { status: 403 });
    }
    let allowed = auth.isJefe || projects.some((p) => p.leader_id === auth.userId);
    if (!allowed) {
      const ids = projects.map((p) => p.id);
      const [tasks, members] = await Promise.all([
        auth.db.from('tasks').select('id').in('project_id', ids).eq('assigned_to', auth.userId).limit(1),
        auth.db.from('project_members').select('project_id').in('project_id', ids).eq('user_id', auth.userId).limit(1),
      ]);
      allowed = !!tasks.data?.length || !!members.data?.length;
    }
    if (!allowed) {
      return NextResponse.json({ error: 'No participas en el proyecto de ese repositorio.' }, { status: 403 });
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const repoRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) {
      const err = await repoRes.json().catch(() => ({}));
      return NextResponse.json({ error: `No se pudo acceder al repositorio: ${err.message || repoRes.statusText}` }, { status: repoRes.status });
    }
    const repoData = await repoRes.json();
    const defaultBranch = repoData.default_branch;

    const refRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`, { headers });
    if (!refRes.ok) {
      const err = await refRes.json().catch(() => ({}));
      return NextResponse.json({ error: `No se pudo leer la rama base (${defaultBranch}): ${err.message || refRes.statusText}` }, { status: refRes.status });
    }
    const refData = await refRes.json();
    const sha = refData.object.sha;

    const createRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      // La rama ya existe: no es un error real (la tarea puede haberse re-guardado).
      if (createRes.status === 422 && typeof err.message === 'string' && err.message.includes('already exists')) {
        return NextResponse.json({ ok: true, branchName, alreadyExisted: true });
      }
      return NextResponse.json({ error: `No se pudo crear la rama: ${err.message || createRes.statusText}` }, { status: createRes.status });
    }

    return NextResponse.json({ ok: true, branchName, alreadyExisted: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
