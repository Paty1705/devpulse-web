'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, StickyNote } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TaskModal } from '@/components/kanban/TaskModal';
import { NewTaskModal } from '@/components/kanban/NewTaskModal';
import { QuickAddModal } from '@/components/agenda/QuickAddModal';

type AgendaTask = {
  id: string;
  title: string;
  status: string;
  item_type: string | null;
  due_date: string | null;
  assigned_to: string | null;
  assignee: { email: string } | null;
  project_id: string | null;
};

type PersonalEvent = {
  id: string;
  title: string;
  event_date: string; // YYYY-MM-DD
};

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const formatDateOnly = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// event_date llega como 'YYYY-MM-DD': parsearlo con `new Date(string)` lo
// interpreta como UTC medianoche y en husos negativos (ej. México) corre el
// día para atrás. Se arma la fecha local a mano para evitar eso.
function parseDateOnly(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function accentColorFor(itemType: string | null) {
  if (itemType === 'Bug') return '#EF4444';
  if (itemType === 'Refactor') return '#D15EEE';
  if (itemType === 'Base de Datos') return '#F59E0B';
  return 'var(--btn-primary-bg)';
}

export default function AgendaPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const isJefe = profile?.role === 'jefe';
  const [leaderProjectIds, setLeaderProjectIds] = useState<string[]>([]);
  const canManageTasks = isJefe || leaderProjectIds.length > 0;

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('projects').select('id').eq('leader_id', user.id);
      setLeaderProjectIds((data || []).map(p => p.id));
    })();
  }, [user]);

  const [tasks, setTasks] = useState<AgendaTask[]>([]);
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [quickAddDate, setQuickAddDate] = useState<Date | null>(null);
  // En el teléfono, tocar un día lo selecciona y su lista aparece abajo.
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  const fetchTasks = useCallback(async () => {
    if (!user || !profile) return;
    setTasksLoading(true);
    let query = supabase
      .from('tasks')
      .select('id, title, status, item_type, due_date, assigned_to, assignee:profiles!tasks_assigned_to_fkey(email), project_id')
      .not('due_date', 'is', null);

    // El jefe ve la agenda de todo el equipo. El líder de un proyecto ve,
    // además de la propia, la de su(s) proyecto(s). El resto, solo la propia.
    if (profile.role !== 'jefe') {
      if (leaderProjectIds.length > 0) {
        query = query.or(`assigned_to.eq.${user.id},project_id.in.(${leaderProjectIds.join(',')})`);
      } else {
        query = query.eq('assigned_to', user.id);
      }
    }

    const { data, error } = await query;
    if (!error && data) setTasks(data as unknown as AgendaTask[]);
    setTasksLoading(false);
  }, [user, profile, leaderProjectIds]);

  const fetchPersonalEvents = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from('personal_events').select('id, title, event_date').eq('user_id', user.id);
    if (!error && data) setPersonalEvents(data);
  }, [user]);

  useEffect(() => {
    if (user && profile) {
      (async () => {
        await fetchTasks();
        await fetchPersonalEvents();
      })();
    }
  }, [user, profile, fetchTasks, fetchPersonalEvents]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, AgendaTask[]>();
    tasks.forEach(t => {
      if (!t.due_date) return;
      const key = dateKey(new Date(t.due_date));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [tasks]);

  const personalEventsByDate = useMemo(() => {
    const map = new Map<string, PersonalEvent[]>();
    personalEvents.forEach(ev => {
      const key = dateKey(parseDateOnly(ev.event_date));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    });
    return map;
  }, [personalEvents]);

  const cells = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const startOffset = new Date(year, month, 1).getDay();
    const gridStart = new Date(year, month, 1 - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [viewDate]);

  const handleAddPersonal = async (title: string) => {
    if (!quickAddDate || !user) return;
    const { error } = await supabase
      .from('personal_events')
      .insert([{ user_id: user.id, title, event_date: formatDateOnly(quickAddDate) }]);
    if (error) {
      alert('Error al guardar la nota: ' + error.message);
      return;
    }
    fetchPersonalEvents();
  };

  const handleDeletePersonal = async (ev: PersonalEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar la nota "${ev.title}"?`)) return;
    const { error } = await supabase.from('personal_events').delete().eq('id', ev.id);
    if (!error) setPersonalEvents(prev => prev.filter(p => p.id !== ev.id));
  };

  const handleCreateWorkTask = () => {
    if (!quickAddDate) return;
    setNewTaskDueDate(formatDateOnly(quickAddDate));
    setQuickAddDate(null);
    setIsNewTaskModalOpen(true);
  };

  if (loading || !user) return <div className="p-8">Cargando agenda...</div>;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = new Date();

  const monthLabel = viewDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  return (
    <div className="max-w-[1400px] space-y-4">
      <header className="flex flex-col gap-2">
        <div className="flex justify-between items-end flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-[1.75rem] font-bold tracking-tight text-[var(--text-primary)]">Mi Agenda</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {canManageTasks ? 'Vencimientos del equipo y tus notas personales.' : 'Tus tareas y notas personales por fecha.'}
              <span className="hidden sm:inline">{' '}Haz clic en un día para agregar algo.</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewDate(d => { const nd = new Date(d); nd.setMonth(nd.getMonth() - 1); return nd; })}
              className="glass-panel w-10 h-10 rounded-[13px] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors active:scale-[0.97]"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="font-display text-base sm:text-lg font-semibold text-[var(--text-primary)] first-letter:uppercase min-w-[9.5rem] text-center">{monthLabel}</span>
            <button
              onClick={() => setViewDate(d => { const nd = new Date(d); nd.setMonth(nd.getMonth() + 1); return nd; })}
              className="glass-panel w-10 h-10 rounded-[13px] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors active:scale-[0.97]"
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => setViewDate(() => { const d = new Date(); d.setDate(1); return d; })}
              className="nav-active min-h-10 px-4 rounded-[13px] text-sm font-semibold transition-transform active:scale-[0.97]"
            >
              Hoy
            </button>
          </div>
        </div>
      </header>

      {tasksLoading ? (
        <div className="text-[var(--text-secondary)] py-12 text-center">Cargando agenda...</div>
      ) : (
        <div className="glass-panel glass-iridescent rounded-[22px] p-2 sm:p-4">
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {WEEKDAY_LABELS.map(l => (
            <div key={l} className="text-center text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] py-1">
              <span className="sm:hidden">{l[0]}</span>
              <span className="hidden sm:inline">{l}</span>
            </div>
          ))}

          {cells.map(d => {
            const key = dateKey(d);
            const dayTasks = tasksByDate.get(key) || [];
            const dayPersonal = personalEventsByDate.get(key) || [];
            const totalCount = dayTasks.length + dayPersonal.length;
            const isCurrentMonth = d.getMonth() === viewDate.getMonth();
            const isToday = key === dateKey(today);

            return (
              <div
                key={key}
                onClick={() => {
                  if (window.matchMedia('(max-width: 639px)').matches) setSelectedDay(d);
                  else setQuickAddDate(d);
                }}
                className={`min-h-[3.3rem] sm:min-h-[6rem] min-w-0 rounded-[11px] sm:rounded-[14px] border p-1 sm:p-1.5 flex flex-col items-center sm:items-stretch gap-1 transition-colors cursor-pointer hover:border-[var(--accent)] ${
                  key === dateKey(selectedDay) && !isToday ? 'max-sm:!border-[var(--accent)]' : ''
                } ${
                  isCurrentMonth
                    ? 'surface-card border-[var(--border-card)]'
                    : 'chip-glass border-transparent opacity-45'
                } ${isToday ? 'ring-2 ring-[var(--accent)] shadow-[0_8px_18px_color-mix(in_srgb,var(--accent)_25%,transparent)]' : ''}`}
              >
                <span className={`font-mono text-xs font-bold sm:self-start ${isToday ? 'nav-active px-2 py-0.5 rounded-[8px]' : 'text-[var(--text-secondary)]'}`}>
                  {d.getDate()}
                </span>
                {/* Teléfono: puntos de color en lugar de nombres. */}
                {totalCount > 0 && (
                  <span className="sm:hidden flex flex-wrap justify-center gap-0.5">
                    {dayTasks.slice(0, 3).map(t => (
                      <span key={t.id} className="w-1.5 h-1.5 rounded-full" style={{ background: t.status !== 'completed' && new Date(t.due_date!) < startOfToday ? '#EF4444' : accentColorFor(t.item_type) }} />
                    ))}
                    {dayPersonal.slice(0, Math.max(0, 3 - dayTasks.length)).map(ev => (
                      <span key={ev.id} className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)]" />
                    ))}
                  </span>
                )}
                <div className="hidden sm:block flex-1 overflow-y-auto space-y-1">
                  {dayTasks.slice(0, 3).map(t => {
                    const isOverdue = t.status !== 'completed' && new Date(t.due_date!) < startOfToday;
                    return (
                      <button
                        key={t.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedTaskId(t.id); }}
                        title={t.title}
                        style={{ borderLeftColor: isOverdue ? '#EF4444' : accentColorFor(t.item_type) }}
                        className="w-full flex items-center gap-1 text-left text-[10px] leading-tight px-1.5 py-1 rounded-[8px] border-l-2 truncate chip-glass hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] transition-colors"
                      >
                        {isOverdue && <AlertTriangle size={9} className="text-red-500 flex-shrink-0" />}
                        <span className="truncate">{t.title}</span>
                      </button>
                    );
                  })}
                  {dayPersonal.slice(0, Math.max(0, 3 - dayTasks.length)).map(ev => (
                    <button
                      key={ev.id}
                      onClick={(e) => handleDeletePersonal(ev, e)}
                      title={`${ev.title} (clic para eliminar)`}
                      className="w-full flex items-center gap-1 text-left text-[10px] leading-tight px-1.5 py-1 rounded-[8px] border-l-2 border-dashed border-[var(--text-secondary)] truncate chip-glass hover:bg-red-500/10 hover:border-red-400 text-[var(--text-secondary)] transition-colors"
                    >
                      <StickyNote size={9} className="flex-shrink-0" />
                      <span className="truncate">{ev.title}</span>
                    </button>
                  ))}
                  {totalCount > 3 && (
                    <span className="block text-[10px] text-[var(--text-secondary)] px-1">+{totalCount - 3} más</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}

      {/* Teléfono: lo del día seleccionado. */}
      {!tasksLoading && (() => {
        const key = dateKey(selectedDay);
        const dayTasks = tasksByDate.get(key) || [];
        const dayPersonal = personalEventsByDate.get(key) || [];
        return (
          <section className="sm:hidden glass-panel rounded-[20px] p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] first-letter:uppercase">
                {selectedDay.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>
              <button onClick={() => setQuickAddDate(selectedDay)} className="nav-active min-h-9 px-3 rounded-[11px] text-[13px] font-semibold">Agregar</button>
            </div>
            {dayTasks.length + dayPersonal.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] py-2">Nada para este día.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {dayTasks.map(t => {
                  const isOverdue = t.status !== 'completed' && new Date(t.due_date!) < startOfToday;
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => setSelectedTaskId(t.id)}
                        style={{ borderLeftColor: isOverdue ? '#EF4444' : accentColorFor(t.item_type) }}
                        className="w-full flex items-center gap-2 text-left text-sm px-3 py-2.5 rounded-[12px] border-l-[3px] chip-glass text-[var(--text-primary)]"
                      >
                        {isOverdue && <AlertTriangle size={13} className="text-red-500 shrink-0" />}
                        <span className="flex-1 min-w-0 truncate">{t.title}</span>
                      </button>
                    </li>
                  );
                })}
                {dayPersonal.map(ev => (
                  <li key={ev.id}>
                    <button
                      onClick={(e) => handleDeletePersonal(ev, e)}
                      className="w-full flex items-center gap-2 text-left text-sm px-3 py-2.5 rounded-[12px] border-l-[3px] border-dashed border-[var(--text-secondary)] chip-glass text-[var(--text-secondary)]"
                    >
                      <StickyNote size={13} className="shrink-0" />
                      <span className="flex-1 min-w-0 truncate">{ev.title}</span>
                      <span className="text-[11px]">quitar</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })()}

      <TaskModal
        isOpen={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        task={selectedTaskId ? { id: selectedTaskId } : null}
        onUpdated={fetchTasks}
      />

      <QuickAddModal
        isOpen={!!quickAddDate}
        date={quickAddDate}
        isJefe={canManageTasks}
        onClose={() => setQuickAddDate(null)}
        onAddPersonal={handleAddPersonal}
        onCreateWorkTask={handleCreateWorkTask}
      />

      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        onTaskCreated={() => { setIsNewTaskModalOpen(false); fetchTasks(); }}
        initialDueDate={newTaskDueDate}
      />
    </div>
  );
}
