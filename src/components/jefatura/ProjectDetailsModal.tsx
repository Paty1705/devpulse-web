import { X, Users, CheckCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Project = {
  id: string;
  name: string;
  description: string | null;
  mode: string;
};

type Responsible = { email: string; role: string };

interface ProjectDetailsModalProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectDetailsModal({ project, isOpen, onClose }: ProjectDetailsModalProps) {
  const [stats, setStats] = useState({ total: 0, completed: 0 });
  const [responsible, setResponsible] = useState<Responsible | null>(null);

  useEffect(() => {
    if (!project || !isOpen) return;
    let cancelled = false;
    const projectId = project.id;

    (async () => {
      const { data: tasks } = await supabase.from('tasks').select('status').eq('project_id', projectId);
      if (!cancelled && tasks) {
        setStats({
          total: tasks.length,
          completed: tasks.filter(t => t.status === 'completed').length
        });
      }

      // Proyectos individuales: un solo responsable (leader_id).
      const { data: row } = await supabase
        .from('projects')
        .select('leader:profiles!projects_leader_id_fkey(email, role)')
        .eq('id', projectId)
        .single();
      if (!cancelled) setResponsible((row?.leader as unknown as Responsible) ?? null);
    })();

    return () => { cancelled = true; };
  }, [project, isOpen]);

  if (!isOpen || !project) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[20px] shadow-[var(--shadow-hover)] w-full max-w-lg flex flex-col overflow-hidden animate-fade-in-up">
        
        <div className="px-6 py-4 flex justify-between items-center bg-[var(--bg-column)] border-b border-[var(--border-column)]">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">{project.name}</h2>
            <span className="text-xs text-[var(--text-secondary)]">Proyecto individual</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">Descripción</h3>
            <p className="text-sm text-[var(--text-primary)] leading-relaxed">{project.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[var(--bg-page)] border border-[var(--border-column)] p-4 rounded-[20px]">
              <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-1">
                <CheckCircle size={16} />
                <span className="text-xs font-bold uppercase">Progreso Tareas</span>
              </div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.completed} / {stats.total}</p>
            </div>
            <div className="bg-[var(--bg-page)] border border-[var(--border-column)] p-4 rounded-[20px] min-w-0">
              <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-1">
                <Users size={16} />
                <span className="text-xs font-bold uppercase">Responsable</span>
              </div>
              <p className="text-base font-bold text-[var(--text-primary)] truncate" title={responsible?.email}>
                {responsible ? responsible.email.split('@')[0] : 'Sin asignar'}
              </p>
              {responsible && <p className="text-xs text-[var(--text-secondary)] truncate">{responsible.email}</p>}
            </div>
          </div>

        </div>

        <div className="px-6 py-4 bg-[var(--bg-column)] border-t border-[var(--border-column)] flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 font-bold text-sm bg-[var(--bg-page)] border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] rounded-[12px] transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
