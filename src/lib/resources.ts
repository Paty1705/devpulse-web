// Tipos y utilidades del tablero de recursos (tabla `resources` y bucket
// privado `resources`; ver supabase/area_personalizacion.sql y recursos.sql).

export type ResourceKind = 'video' | 'documento' | 'enlace';

export type Resource = {
  id: string;
  title: string;
  kind: ResourceKind;
  url: string | null;
  storage_path: string | null;
  description: string | null;
  tags: string[];
  duration_minutes: number | null;
  project_id: string | null;
  recommended_for: string | null;
  recommended_by: string | null;
  pinned: boolean;
  created_at: string;
};

export const KIND_LABEL: Record<ResourceKind, string> = {
  video: 'Video',
  documento: 'Documento',
  enlace: 'Enlace',
};

/** Límite del bucket (50 MB en el plan gratuito). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** ID de YouTube si el link es de YouTube (watch, youtu.be, shorts, embed). */
export function youtubeId(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/?]+)/);
      return m ? m[2] : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Adivina el tipo a partir del link o del nombre de archivo. */
export function guessKind(urlOrName: string): ResourceKind {
  const s = urlOrName.toLowerCase();
  if (youtubeId(urlOrName) || /vimeo\.com|loom\.com|\.(mp4|webm|mov|mkv)(\?|$)/.test(s)) return 'video';
  if (/\.(pdf|docx?|pptx?|xlsx?|md|txt)(\?|$)|docs\.google\.com|notion\.(so|site)/.test(s)) return 'documento';
  return 'enlace';
}

/** Etiquetas a partir de texto separado por comas, sin repetidas. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(',')) {
    const t = raw.trim().toLowerCase().replace(/^#/, '');
    if (t) seen.add(t);
  }
  return [...seen].slice(0, 8);
}

export function hostOf(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Nombre legible del archivo guardado como `<user>/<timestamp>-<nombre>`. */
export function fileNameOf(path: string | null) {
  if (!path) return null;
  return path.split('/').pop()?.replace(/^\d+-/, '') ?? null;
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Nombre seguro para Storage (sin acentos ni espacios). */
export function safeFileName(name: string) {
  const clean = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  return clean.slice(-80) || 'archivo';
}
