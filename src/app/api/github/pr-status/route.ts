import { NextResponse } from 'next/server';
import { parsePullRequestUrl } from '@/lib/github';

const GITHUB_API = 'https://api.github.com';

export async function POST(req: Request) {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'GITHUB_TOKEN no está configurado en el servidor.' }, { status: 500 });
    }

    const { prUrl } = await req.json();
    if (!prUrl) {
      return NextResponse.json({ error: 'Falta prUrl.' }, { status: 400 });
    }

    const prInfo = parsePullRequestUrl(prUrl);
    if (!prInfo) {
      return NextResponse.json({ error: 'La URL no es un Pull Request de GitHub válido.' }, { status: 400 });
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const res = await fetch(`${GITHUB_API}/repos/${prInfo.owner}/${prInfo.repo}/pulls/${prInfo.number}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: `No se pudo consultar el Pull Request: ${err.message || res.statusText}` }, { status: res.status });
    }
    const data = await res.json();

    return NextResponse.json({
      state: data.state as 'open' | 'closed',
      merged: !!data.merged,
      draft: !!data.draft,
      title: data.title as string,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
