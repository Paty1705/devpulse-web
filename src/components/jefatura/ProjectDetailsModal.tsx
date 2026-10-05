import { X, Users, CheckCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Project = {
  id: string;
  name: string;
  description: string | null;
  mode: string;
};

type Member = { email: string; role: string };

interface ProjectDetailsModalProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectDetailsModal({ project, isOpen, onClose }: ProjectDetailsModalProps) {
  const [stats, setStats] = useState({ total: 0, completed: 0 });
  const [members, setMembers] = useState<Member[]>([]);

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

      const { data: memberRows } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', projectId);

      if (cancelled) return;

      if (memberRows && memberRows.length > 0) {
        const userIds = memberRows.map(d => d.user_id);
        const { data: profiles } = await supabase.from('profiles').select('email, role').in('id', userIds);
        if (!cancelled && profiles) setMembers(profiles);
      } else {
        setMembers([]);
      }
    })();

    return () => { cancelled = true; };
  }, [project, isOpen]);

  if (!isOpen || !project) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] shadow-[var(--shadow-hover)] w-full max-w-lg flex flex-col overflow-hidden animate-fade-in-up">
        
        <div className="px-6 py-4 flex justify-between items-center bg-[var(--bg-column)] border-b border-[var(--border-column)]">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">{project.name}</h2>
            <span className="text-xs text-[var(--text-secondary)]">{project.mode}</span>
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
            <div className="bg-[var(--bg-page)] border border-[var(--border-column)] p-4 rounded-[8px]">
              <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-1">
                <CheckCircle size={16} />
                <span className="text-xs font-bold uppercase">Progreso Tareas</span>
              </div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.completed} / {stats.total}</p>
            </div>
            <div className="bg-[var(--bg-page)] border border-[var(--border-column)] p-4 rounded-[8px]">
              <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-1">
                <Users size={16} />
                <span className="text-xs font-bold uppercase">Equipo</span>
              </div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{members.length} miembros</p>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-3">Integrantes del Equipo</h3>
            {members.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] italic">No hay miembros asignados.</p>
            ) : (
              <ul className="space-y-2">
                {members.map((m, i) => (
                  <li key={i} className="flex justify-between items-center text-sm p-2 bg-[var(--bg-page)] border border-[var(--border-column)] rounded-[6px]">
                    <span className="text-[var(--text-primary)] font-medium">{m.email}</span>
                    <span className="text-xs bg-[var(--badge-bg)] text-[var(--badge-text)] px-2 py-0.5 rounded-[4px] uppercase">{m.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-[var(--bg-column)] border-t border-[var(--border-column)] flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 font-bold text-sm bg-[var(--bg-page)] border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] rounded-[6px] transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
