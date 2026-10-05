// Utilidades compartidas para la integración con GitHub (creación de rama +
// consulta de estado de PR). Centralizadas acá para que el nombre de rama se
// calcule igual en todos los lugares que lo usan (antes vivía duplicado y
// con esquemas distintos en NewTaskModal y TaskModal).

export function parseGithubRepo(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const url = new URL(repoUrl);
    if (!url.hostname.includes('github.com')) return null;
    const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

export function parsePullRequestUrl(prUrl: string): { owner: string; repo: string; number: number } | null {
  try {
    const url = new URL(prUrl);
    if (!url.hostname.includes('github.com')) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const pullIndex = parts.indexOf('pull');
    if (pullIndex === -1 || parts.length < pullIndex + 2) return null;
    const number = parseInt(parts[pullIndex + 1], 10);
    if (!Number.isFinite(number)) return null;
    return { owner: parts[0], repo: parts[1], number };
  } catch {
    return null;
  }
}

export function branchNameForTask(taskId: string, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'tarea';
  return `feature/TASK-${taskId.slice(0, 6)}-${slug}`;
}

export function slugifyRepoName(input: string): string {
  const slug = input
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_.]+/g, '-')
    .replace(/(^[-.]+|[-.]+$)/g, '')
    .slice(0, 100);
  return slug || 'proyecto';
}
