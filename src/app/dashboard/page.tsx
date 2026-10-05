'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Calendar, CheckCircle, Clock, AlertTriangle, FolderGit2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TaskModal } from '@/components/kanban/TaskModal';

type DashboardTask = {
  id: string;
  title: string;
  status: string;
  item_type: string | null;
  due_date: string | null;
  assigned_to: string | null;
  assignee: { email: string } | null;
  project_id: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'En Progreso',
  in_review: 'En Pruebas / Auditoría',
  ready: 'Listo para Despliegue',
  completed: 'Completado',
};

export default function DashboardPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const isJefe = profile?.role === 'jefe';
  const [visibleTasks, setVisibleTasks] = useState<DashboardTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [leaderProjectIds, setLeaderProjectIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('projects').select('id').eq('leader_id', user.id);
      setLeaderProjectIds((data || []).map(p => p.id));
    })();
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  const fetchVisibleTasks = useCallback(async () => {
    if (!user || !profile) return;
    setTasksLoading(true);
    let query = supabase
      .from('tasks')
      .select('id, title, status, item_type, due_date, assigned_to, assignee:profiles!tasks_assigned_to_fkey(email), project_id')
      .order('due_date', { ascending: true });

    // El jefe ve las tareas de todo el equipo. El líder de un proyecto ve,
    // además de las propias, las de su(s) proyecto(s). El resto solo las propias.
    if (profile.role !== 'jefe') {
      if (leaderProjectIds.length > 0) {
        query = query.or(`assigned_to.eq.${user.id},project_id.in.(${leaderProjectIds.join(',')})`);
      } else {
        query = query.eq('assigned_to', user.id);
      }
    }

    const { data, error } = await query;
    if (!error && data) setVisibleTasks(data as unknown as DashboardTask[]);
    setTasksLoading(false);
  }, [user, profile, leaderProjectIds]);

  useEffect(() => {
    if (user && profile) {
      (async () => {
        await fetchVisibleTasks();
      })();
    }
  }, [user, profile, fetchVisibleTasks]);

  if (loading || !user) return <div className="p-8">Cargando dashboard...</div>;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setHours(23, 59, 59, 999);
  const weekFromNow = new Date(startOfToday);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const pendingTasks = visibleTasks.filter(t => t.status !== 'completed');
  const urgentTasks = pendingTasks.filter(t => t.due_date && new Date(t.due_date) <= endOfToday);
  const weekTasks = pendingTasks.filter(t => t.due_date && new Date(t.due_date) > endOfToday && new Date(t.due_date) <= weekFromNow);
  const completedTasks = visibleTasks.filter(t => t.status === 'completed').slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">Panel de Control</h1>
        <p className="text-[var(--text-secondary)]">
          {isJefe ? 'Bienvenido, este es el estado de las tareas de todo el equipo.' : 'Bienvenido, gestiona tus tareas y auditorías.'}
        </p>
      </header>

      {(isJefe || leaderProjectIds.length > 0) && (
        <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-6 mb-8 shadow-[var(--shadow-subtle)]">
          <h2 className="text-xl font-bold mb-4 text-[var(--text-primary)]">Gestión de Jefatura</h2>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/dashboard/jefatura')}
              className="flex items-center gap-2 border border-[var(--border-card)] text-[var(--text-primary)] px-4 py-2 rounded-[6px] font-bold hover:bg-[var(--bg-page)] shadow-sm transition-all active:scale-[0.97]"
            >
              <FolderGit2 size={18} />
              Ver Proyectos
            </button>
            {isJefe && (
              <button
                onClick={() => router.push('/dashboard/jefatura')}
                className="flex items-center gap-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] px-4 py-2 rounded-[6px] font-bold hover:brightness-110 shadow-sm transition-all active:scale-[0.97]"
              >
                <Plus size={18} />
                Crear Nuevo Proyecto
              </button>
            )}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tareas de Hoy */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-6 shadow-[var(--shadow-subtle)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[var(--badge-urgent-bg)] text-[var(--badge-urgent-text)] rounded-[6px]">
              <Clock size={24} />
            </div>
            <h3 className="font-bold text-lg text-[var(--text-primary)]">Urgente (Hoy)</h3>
          </div>
          {tasksLoading ? (
            <p className="text-[var(--text-secondary)] text-sm">Cargando...</p>
          ) : urgentTasks.length === 0 ? (
            <p className="text-[var(--text-secondary)] text-sm">No hay tareas pendientes para hoy.</p>
          ) : (
            <ul className="space-y-2">
              {urgentTasks.map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedTaskId(t.id)}
                    className="w-full text-left text-sm text-[var(--text-primary)] font-medium bg-[var(--bg-page)] hover:bg-[var(--bg-column)] border border-[var(--border-column)] rounded-[6px] px-3 py-2 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      {t.title}
                      {t.due_date && new Date(t.due_date) < startOfToday ? (
                        <span className="inline-flex items-center gap-1 bg-[var(--badge-locked-bg)] text-[var(--badge-locked-text)] px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold uppercase tracking-wider flex-shrink-0">
                          <AlertTriangle size={10} /> Atrasada
                        </span>
                      ) : (
                        <span className="inline-flex items-center bg-[var(--badge-urgent-bg)] text-[var(--badge-urgent-text)] px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold uppercase tracking-wider flex-shrink-0">
                          Hoy
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-[var(--text-secondary)] mt-0.5">
                      {STATUS_LABELS[t.status] || t.status}
                      {(isJefe || leaderProjectIds.length > 0) && t.assignee?.email && ` · ${t.assignee.email}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Esta semana */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-6 shadow-[var(--shadow-subtle)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[var(--badge-bg)] text-[var(--badge-text)] rounded-[6px]">
              <Calendar size={24} />
            </div>
            <h3 className="font-bold text-lg text-[var(--text-primary)]">Esta Semana</h3>
          </div>
          {tasksLoading ? (
            <p className="text-[var(--text-secondary)] text-sm">Cargando...</p>
          ) : weekTasks.length === 0 ? (
            <p className="text-[var(--text-secondary)] text-sm">Las tareas planificadas aparecerán aquí.</p>
          ) : (
            <ul className="space-y-2">
              {weekTasks.map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedTaskId(t.id)}
                    className="w-full text-left text-sm text-[var(--text-primary)] font-medium bg-[var(--bg-page)] hover:bg-[var(--bg-column)] border border-[var(--border-column)] rounded-[6px] px-3 py-2 transition-colors"
                  >
                    {t.title}
                    <span className="block text-xs text-[var(--text-secondary)] mt-0.5">
                      {t.due_date && new Date(t.due_date).toLocaleDateString()}
                      {(isJefe || leaderProjectIds.length > 0) && t.assignee?.email && ` · ${t.assignee.email}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Completadas */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-6 shadow-[var(--shadow-subtle)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[var(--badge-sql-bg)] text-[var(--badge-sql-text)] rounded-[6px]">
              <CheckCircle size={24} />
            </div>
            <h3 className="font-bold text-lg text-[var(--text-primary)]">Completadas</h3>
          </div>
          {tasksLoading ? (
            <p className="text-[var(--text-secondary)] text-sm">Cargando...</p>
          ) : completedTasks.length === 0 ? (
            <p className="text-[var(--text-secondary)] text-sm">0 tareas completadas recientemente.</p>
          ) : (
            <ul className="space-y-2">
              {completedTasks.map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedTaskId(t.id)}
                    className="w-full text-left text-sm text-[var(--text-primary)] font-medium bg-[var(--bg-page)] hover:bg-[var(--bg-column)] border border-[var(--border-column)] rounded-[6px] px-3 py-2 transition-colors"
                  >
                    {t.title}
                    {(isJefe || leaderProjectIds.length > 0) && t.assignee?.email && (
                      <span className="block text-xs text-[var(--text-secondary)] mt-0.5">{t.assignee.email}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Botones temporales hacia el Kanban y la Agenda */}
      <div className="mt-8 flex justify-end gap-3">
        <button
          onClick={() => router.push('/dashboard/agenda')}
          className="bg-[var(--bg-column)] border border-[var(--border-column)] text-[var(--text-primary)] px-4 py-2 rounded-[6px] font-bold hover:bg-[var(--btn-primary-bg)] hover:text-[var(--btn-primary-text)] hover:border-[var(--btn-primary-bg)] shadow-[var(--shadow-subtle)] transition-all active:scale-[0.97]"
        >
          Ir a mi Agenda &rarr;
        </button>
        <button
          onClick={() => router.push('/dashboard/kanban')}
          className="bg-[var(--bg-column)] border border-[var(--border-column)] text-[var(--text-primary)] px-4 py-2 rounded-[6px] font-bold hover:bg-[var(--btn-primary-bg)] hover:text-[var(--btn-primary-text)] hover:border-[var(--btn-primary-bg)] shadow-[var(--shadow-subtle)] transition-all active:scale-[0.97]"
        >
          Ir al Tablero Kanban &rarr;
        </button>
      </div>

      <TaskModal
        isOpen={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        task={selectedTaskId ? { id: selectedTaskId } : null}
        onUpdated={fetchVisibleTasks}
      />
    </div>
  );
}
