'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { ArrowLeft, GitBranch, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { parseGithubRepo } from '@/lib/github';

type Project = { id: string; name: string; repo_url: string | null; leader_id: string | null };

type BranchLog = {
  id: string;
  branch_name: string;
  already_existed: boolean;
  created_at: string;
  project_id: string;
  task: { title: string } | null;
  creator: { email: string } | null;
};

export default function VersionesPage() {
  const { profile, user } = useAuth();
  const router = useRouter();
  const isJefe = profile?.role === 'jefe';

  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs] = useState<BranchLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>('all');

  const fetchData = useCallback(async () => {
    const { data: projs } = await supabase.from('projects').select('id, name, repo_url, leader_id');
    setProjects(projs || []);

    const { data: logRows, error } = await supabase
      .from('branch_logs')
      .select('id, branch_name, already_existed, created_at, project_id, task:tasks(title), creator:profiles!branch_logs_created_by_fkey(email)')
      .order('created_at', { ascending: false });

    if (error) console.warn('No se pudo cargar el control de versiones:', error.message);
    setLogs((logRows as unknown as BranchLog[]) || []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    (async () => { await fetchData(); })();
  }, [fetchData]);

  // Jefe ve todas las ramas. Líder de proyecto solo ve las de su(s)
  // proyecto(s), igual que en el resto de la sección de jefatura.
  const ledProjectIds = useMemo(
    () => new Set(projects.filter(p => p.leader_id === user?.id).map(p => p.id)),
    [projects, user?.id]
  );
  const visibleLogs = isJefe ? logs : logs.filter(l => ledProjectIds.has(l.project_id));
  const visibleProjects = isJefe ? projects : projects.filter(p => ledProjectIds.has(p.id));
  const canSeePage = isJefe || ledProjectIds.size > 0;

  const filteredLogs = projectFilter === 'all' ? visibleLogs : visibleLogs.filter(l => l.project_id === projectFilter);
  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  const branchUrl = (log: BranchLog) => {
    const project = projectById.get(log.project_id);
    if (!project?.repo_url) return null;
    const info = parseGithubRepo(project.repo_url);
    if (!info) return null;
    return `https://github.com/${info.owner}/${info.repo}/tree/${log.branch_name}`;
  };

  if (!loaded) {
    return <div className="p-8 text-[var(--text-secondary)]">Cargando...</div>;
  }

  if (profile && !canSeePage) {
    return (
      <div className="p-8 bg-red-50 text-red-600 rounded-lg max-w-2xl mx-auto mt-8 border border-red-200">
        <h2 className="text-xl font-bold mb-2">Acceso Denegado</h2>
        <p>Esta vista es exclusiva para jefatura o líderes de proyecto.</p>
        <button onClick={() => router.push('/dashboard')} className="mt-4 underline">Volver al panel</button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <header className="mb-8 flex justify-between items-end flex-wrap gap-4">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => router.push('/dashboard/jefatura')}
            className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors self-start text-sm font-bold bg-[var(--bg-column)] border border-[var(--border-column)] px-3 py-1.5 rounded-[6px] shadow-[var(--shadow-subtle)] hover:border-[var(--btn-primary-bg)] active:scale-[0.97]"
          >
            <ArrowLeft size={16} />
            Volver a Proyectos
          </button>
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Control de Versiones</h1>
            <p className="text-[var(--text-secondary)] mt-1">
              Auditoría de ramas Git creadas desde DevPulse: quién, en qué proyecto y cuándo.
            </p>
          </div>
        </div>

        {visibleProjects.length > 1 && (
          <select
            value={projectFilter}
            onChange={e => setProjectFilter(e.target.value)}
            className="bg-[var(--bg-page)] border border-[var(--border-column)] text-[var(--text-primary)] rounded-[6px] px-3 py-2 text-sm font-bold"
          >
            <option value="all">Todos los proyectos</option>
            {visibleProjects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </header>

      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] shadow-[var(--shadow-subtle)] overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-secondary)]">
            <GitBranch size={48} className="mx-auto mb-4 opacity-50" />
            <p>No hay ramas registradas todavía.</p>
            <p className="text-sm mt-1 opacity-70">Se registran automáticamente al crear una tarea o al usar &quot;Crear rama en GitHub&quot;.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--bg-column)] border-b border-[var(--border-column)] text-left text-[var(--text-secondary)] uppercase text-xs tracking-wider">
                <th className="px-4 py-3">Rama</th>
                <th className="px-4 py-3">Proyecto</th>
                <th className="px-4 py-3">Tarea</th>
                <th className="px-4 py-3">Creada por</th>
                <th className="px-4 py-3">Fecha y hora</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => {
                const project = projectById.get(log.project_id);
                const url = branchUrl(log);
                return (
                  <tr key={log.id} className="border-b border-[var(--border-column)] last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors">
                    <td className="px-4 py-3 font-mono text-[var(--text-primary)]">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[var(--btn-primary-bg)] hover:underline">
                          {log.branch_name} <ExternalLink size={12} />
                        </a>
                      ) : log.branch_name}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{project?.name || '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{log.task?.title || '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{log.creator?.email || '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-[4px] ${log.already_existed ? 'bg-[var(--badge-bg)] text-[var(--badge-text)]' : 'bg-[var(--badge-sql-bg)] text-[var(--badge-sql-text)]'}`}>
                        {log.already_existed ? 'Ya existía' : 'Creada'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
