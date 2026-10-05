import { NextResponse } from 'next/server';

const GITHUB_API = 'https://api.github.com';

export async function POST(req: Request) {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'GITHUB_TOKEN no está configurado en el servidor.' }, { status: 500 });
    }

    const { name, description, isPrivate } = await req.json();
    if (!name) {
      return NextResponse.json({ error: 'Falta el nombre del repositorio.' }, { status: 400 });
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };

    // auto_init crea un commit inicial (README) para que el repo ya tenga
    // una rama por defecto — sin esto, create-branch no tendría de dónde partir.
    const res = await fetch(`${GITHUB_API}/user/repos`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name,
        description: description || undefined,
        private: isPrivate !== false,
        auto_init: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: `No se pudo crear el repositorio: ${err.message || res.statusText}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, repoUrl: data.html_url as string });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
