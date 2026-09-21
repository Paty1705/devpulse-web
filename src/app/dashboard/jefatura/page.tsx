'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Plus, FolderGit2, ArrowLeft, Info, Edit, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { NewProjectModal } from '@/components/jefatura/NewProjectModal';
import { ProjectDetailsModal } from '@/components/jefatura/ProjectDetailsModal';
import { supabase } from '@/lib/supabase';

export default function JefaturaPage() {
  const { profile } = useAuth();
  const router = useRouter();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (data) setProjects(data);
  };

  const deleteProject = async (id: string, name: string) => {
    if (confirm(`¿Estás seguro de que deseas eliminar permanentemente el proyecto "${name}"? Esto borrará todas sus tareas y equipos asociados.`)) {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) {
        alert("Error al eliminar el proyecto: " + error.message);
      } else {
        fetchProjects();
      }
    }
  };

  if (profile && profile.role !== 'jefe') {
    return (
      <div className="p-8 bg-red-50 text-red-600 rounded-lg max-w-2xl mx-auto mt-8 border border-red-200">
        <h2 className="text-xl font-bold mb-2">Acceso Denegado</h2>
        <p>Esta vista es exclusiva para el rol de Jefatura.</p>
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
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] hover:text-white dark:hover:text-white px-5 py-2.5 rounded-[6px] font-bold tracking-wide transition-all shadow-[0_0_15px_rgba(17,219,220,0.2)] hover:shadow-[0_0_20px_var(--btn-primary-bg)] active:scale-[0.97] flex items-center gap-2"
        >
          <Plus size={20} />
          Nuevo Proyecto
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {projects.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-[var(--text-secondary)] border-2 border-dashed border-[var(--border-column)] rounded-[12px] bg-[var(--bg-column)]">
            <FolderGit2 size={48} className="mx-auto mb-4 opacity-50" />
            <p>No hay proyectos activos.</p>
            <p className="text-sm mt-1 opacity-70">Haz clic en "Nuevo Proyecto" para comenzar.</p>
          </div>
        ) : (
          projects.map(p => (
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
                <a href={p.repo_url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-[6px] text-sm font-bold text-[var(--btn-primary-bg)] bg-[var(--bg-column)] hover:bg-[var(--btn-primary-bg)] hover:text-white dark:hover:text-[#090A10] w-full transition-colors border border-[var(--btn-primary-bg)] shadow-sm">
                  <FolderGit2 size={16} /> Repositorio
                </a>
                
                {/* Botones de acción secundaria */}
                <div className="flex gap-2 w-full mt-1">
                  <button onClick={() => setSelectedProject(p)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-page)] hover:bg-[var(--bg-column)] transition-colors border border-[var(--border-column)]">
                    <Info size={14} /> Detalles
                  </button>
                  <button onClick={() => alert("Editar: En desarrollo")} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-page)] hover:bg-[var(--bg-column)] transition-colors border border-[var(--border-column)]">
                    <Edit size={14} /> Editar
                  </button>
                  <button onClick={() => deleteProject(p.id, p.name)} className="flex items-center justify-center px-3 py-1.5 rounded-[6px] text-[#EF4444] hover:text-white hover:bg-[#EF4444] bg-[var(--bg-page)] transition-colors border border-[#EF4444]/30">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <NewProjectModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onProjectCreated={fetchProjects}
      />
      
      <ProjectDetailsModal
        project={selectedProject}
        isOpen={!!selectedProject}
        onClose={() => setSelectedProject(null)}
      />
    </div>
  );
}
