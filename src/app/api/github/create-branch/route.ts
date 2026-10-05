import { NextResponse } from 'next/server';
import { parseGithubRepo } from '@/lib/github';

const GITHUB_API = 'https://api.github.com';

export async function POST(req: Request) {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'GITHUB_TOKEN no está configurado en el servidor.' }, { status: 500 });
    }

    const { repoUrl, branchName } = await req.json();
    if (!repoUrl || !branchName) {
      return NextResponse.json({ error: 'Falta repoUrl o branchName.' }, { status: 400 });
    }

    const repoInfo = parseGithubRepo(repoUrl);
    if (!repoInfo) {
      return NextResponse.json({ error: 'La URL del repositorio no es un repositorio de GitHub válido.' }, { status: 400 });
    }
    const { owner, repo } = repoInfo;

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
