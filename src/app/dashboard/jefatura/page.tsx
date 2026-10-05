'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Plus, FolderGit2, ArrowLeft, Info, Edit, Trash2, X, AlertTriangle, GitBranch } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { NewProjectModal } from '@/components/jefatura/NewProjectModal';
import { ProjectDetailsModal } from '@/components/jefatura/ProjectDetailsModal';
import { supabase } from '@/lib/supabase';

type Project = {
  id: string;
  name: string;
  description: string | null;
  repo_url: string | null;
  mode: string;
  leader_id: string | null;
};

export default function JefaturaPage() {
  const { profile, user } = useAuth();
  const router = useRouter();
  const isJefe = profile?.role === 'jefe';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [alsoDeleteRepo, setAlsoDeleteRepo] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (data) setProjects(data);
    setProjectsLoaded(true);
  }, []);

  useEffect(() => {
    (async () => {
      await fetchProjects();
    })();
  }, [fetchProjects]);

  const requestDelete = (p: Project) => {
    setDeleteTarget(p);
    setAlsoDeleteRepo(false);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);

    if (alsoDeleteRepo && deleteTarget.repo_url) {
      try {
        const res = await fetch('/api/github/delete-repo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoUrl: deleteTarget.repo_url }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setDeleteError(data.error || 'No se pudo borrar el repositorio en GitHub.');
          setIsDeleting(false);
          return;
        }
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : String(err));
        setIsDeleting(false);
        return;
      }
    }

    const { error } = await supabase.from('projects').delete().eq('id', deleteTarget.id);
    setIsDeleting(false);
    if (error) {
      setDeleteError('Error al eliminar el proyecto: ' + error.message);
    } else {
      setDeleteTarget(null);
      fetchProjects();
    }
  };

  // Un líder de proyecto (que no es jefe) también puede entrar, pero solo
  // ve/gestiona el o los proyectos donde él mismo es leader_id.
  const ledProjects = projects.filter(p => p.leader_id === user?.id);
  const visibleProjects = isJefe ? projects : ledProjects;
  const canSeePage = isJefe || ledProjects.length > 0;

  if (!projectsLoaded) {
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
      <header className="mb-8 flex justify-between items-end">
        <div className="flex flex-col gap-2">
          <button 
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors self-start text-sm font-bold bg-[var(--bg-column)] border border-[var(--border-column)] px-3 py-1.5 rounded-[6px] shadow-[var(--shadow-subtle)] hover:border-[var(--btn-primary-bg)] active:scale-[0.97]"
          >
            <ArrowLeft size={16} />
            Volver al Panel
          </button>
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Gobernanza de Proyectos</h1>
            <p className="text-[var(--text-secondary)] mt-1">Crea y administra los desarrollos activos.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/jefatura/versiones')}
            className="flex items-center gap-2 border border-[var(--border-card)] text-[var(--text-primary)] px-4 py-2.5 rounded-[6px] font-bold hover:bg-[var(--bg-page)] shadow-sm transition-all active:scale-[0.97]"
          >
            <GitBranch size={18} />
            Control de Versiones
          </button>
          {isJefe && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] hover:text-white dark:hover:text-white px-5 py-2.5 rounded-[6px] font-bold tracking-wide transition-all shadow-[0_0_15px_rgba(17,219,220,0.2)] hover:shadow-[0_0_20px_var(--btn-primary-bg)] active:scale-[0.97] flex items-center gap-2"
            >
              <Plus size={20} />
              Nuevo Proyecto
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {visibleProjects.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-[var(--text-secondary)] border-2 border-dashed border-[var(--border-column)] rounded-[12px] bg-[var(--bg-column)]">
            <FolderGit2 size={48} className="mx-auto mb-4 opacity-50" />
            <p>No hay proyectos activos.</p>
            {isJefe && <p className="text-sm mt-1 opacity-70">Haz clic en &quot;Nuevo Proyecto&quot; para comenzar.</p>}
          </div>
        ) : (
          visibleProjects.map(p => (
            <div key={p.id} className="bg-[var(--bg-card)] border border-[var(--border-card)] p-5 rounded-[8px] shadow-[var(--shadow-subtle)] flex flex-col justify-between hover:bg-[var(--bg-card-hover)] transition-colors">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-xl text-[var(--text-primary)]">{p.name}</h3>
                  <span className="text-xs bg-[var(--badge-bg)] text-[var(--badge-text)] px-2.5 py-1 rounded-[6px] font-bold uppercase tracking-wider">{p.mode}</span>
                </div>
                <p className="text-sm text-[var(--text-primary)] opacity-80 mb-4 line-clamp-3">{p.description}</p>
              </div>
              
              <div className="mt-2 flex flex-col gap-2">
                {/* Botón principal corregido para contraste en modo claro */}
                <a href={p.repo_url ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-[6px] text-sm font-bold text-[var(--btn-primary-bg)] bg-[var(--bg-column)] hover:bg-[var(--btn-primary-bg)] hover:text-white dark:hover:text-[#090A10] w-full transition-colors border border-[var(--btn-primary-bg)] shadow-sm">
                  <FolderGit2 size={16} /> Repositorio
                </a>
                
                {/* Botones de acción secundaria */}
                <div className="flex gap-2 w-full mt-1">
                  <button onClick={() => setSelectedProject(p)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-page)] hover:bg-[var(--bg-column)] transition-colors border border-[var(--border-column)]">
                    <Info size={14} /> Detalles
                  </button>
                  <button onClick={() => setEditingProject(p)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-page)] hover:bg-[var(--bg-column)] transition-colors border border-[var(--border-column)]">
                    <Edit size={14} /> Editar
                  </button>
                  {isJefe && (
                    <button onClick={() => requestDelete(p)} className="flex items-center justify-center px-3 py-1.5 rounded-[6px] text-[#EF4444] hover:text-white hover:bg-[#EF4444] bg-[var(--bg-page)] transition-colors border border-[#EF4444]/30">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <NewProjectModal
        isOpen={isModalOpen || !!editingProject}
        onClose={() => { setIsModalOpen(false); setEditingProject(null); }}
        onProjectCreated={fetchProjects}
        project={editingProject}
      />
      
      <ProjectDetailsModal
        project={selectedProject}
        isOpen={!!selectedProject}
        onClose={() => setSelectedProject(null)}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] shadow-[var(--shadow-hover)] w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-[var(--bg-column)] border-b border-[var(--border-column)] flex justify-between items-start">
              <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <AlertTriangle size={18} className="text-[#EF4444]" />
                Eliminar proyecto
              </h3>
              <button onClick={() => setDeleteTarget(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-[var(--text-primary)]">
                ¿Estás seguro de que deseas eliminar permanentemente el proyecto <strong>&quot;{deleteTarget.name}&quot;</strong>? Esto borrará todas sus tareas y equipos asociados.
              </p>
              {deleteTarget.repo_url && (
                <label className="flex items-start gap-2 text-sm text-[var(--text-primary)] cursor-pointer bg-[var(--bg-page)] border border-[var(--border-column)] rounded-[6px] p-3">
                  <input
                    type="checkbox" checked={alsoDeleteRepo}
                    onChange={(e) => setAlsoDeleteRepo(e.target.checked)}
                    className="mt-0.5 rounded-[4px] text-[var(--btn-primary-bg)] focus:ring-[var(--btn-primary-bg)] bg-[var(--bg-column)] border-[var(--border-card)]"
                  />
                  <span>
                    También eliminar el repositorio vinculado en GitHub
                    <span className="block text-[11px] text-[var(--text-secondary)] break-all">{deleteTarget.repo_url}</span>
                  </span>
                </label>
              )}
              {deleteError && (
                <p className="text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-[6px] p-2">{deleteError}</p>
              )}
            </div>
            <div className="px-5 py-4 bg-[var(--bg-column)] border-t border-[var(--border-column)] flex justify-end gap-2">
              <button
                type="button" onClick={() => setDeleteTarget(null)} disabled={isDeleting}
                className="px-4 py-2 text-sm font-bold border border-[var(--border-card)] text-[var(--text-primary)] rounded-[6px] hover:bg-[var(--bg-page)] transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button" onClick={confirmDelete} disabled={isDeleting}
                className="px-4 py-2 text-sm font-bold bg-[#EF4444] text-white rounded-[6px] hover:brightness-110 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 size={16} /> {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
