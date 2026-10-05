'use client';

import { useState, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Lock, FileCode, Clock, ArrowLeft, AlertTriangle } from 'lucide-react';
import { TaskModal } from '@/components/kanban/TaskModal';
import { NewTaskModal } from '@/components/kanban/NewTaskModal';
import { useAuth } from '@/components/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type Task = {
  id: string;
  title: string;
  status: string;
  is_locked: boolean;
  locked_by: string | null;
  requires_sql: boolean;
  assigned_to: string | null;
  item_type?: string;
  due_date?: string | null;
  project_id: string | null;
};

type Column = {
  id: string;
  title: string;
  tasks: Task[];
};

const COLUMN_DEFS: { id: string; title: string }[] = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'in_progress', title: 'En Progreso' },
  { id: 'in_review', title: 'En Pruebas / Auditoría' },
  { id: 'ready', title: 'Listo para Despliegue' },
  { id: 'completed', title: 'Completado' },
];

export function KanbanBoard() {
  const { profile, user } = useAuth();
  const router = useRouter();
  const [columns, setColumns] = useState<Record<string, Column>>(
    Object.fromEntries(COLUMN_DEFS.map(c => [c.id, { ...c, tasks: [] }]))
  );
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [leaderProjectIds, setLeaderProjectIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('projects').select('id').eq('leader_id', user.id);
      setLeaderProjectIds(new Set((data || []).map(p => p.id)));
    })();
  }, [user]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, status, is_locked, locked_by, requires_sql, assigned_to, item_type, due_date, project_id')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error al cargar tareas:', error);
      setLoading(false);
      return;
    }

    const grouped: Record<string, Column> = Object.fromEntries(
      COLUMN_DEFS.map(c => [c.id, { ...c, tasks: [] as Task[] }])
    );
    (data || []).forEach((t: Task) => {
      if (grouped[t.status]) {
        grouped[t.status].tasks.push(t);
      } else {
        grouped.backlog.tasks.push(t);
      }
    });
    setColumns(grouped);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await fetchTasks();
    })();

    const channel = supabase
      .channel('tasks_board_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTasks]);

  // El jefe puede mover cualquier tarea, EXCEPTO una que la persona asignada
  // ya puso "en progreso" (bloqueada por otro usuario): ahí pierde el control
  // hasta que se libere. El desarrollador asignado puede mover la suya, pero
  // una vez que entra en auditoría (in_review) o llega a "ready" (lista para
  // desplegar) queda liberada: ni siquiera el asignado puede seguir
  // moviéndola, solo el jefe decide el paso siguiente.
  const isManagerOfTask = useCallback((task: Task) => {
    return profile?.role === 'jefe' || (!!task.project_id && leaderProjectIds.has(task.project_id));
  }, [profile, leaderProjectIds]);

  const canModifyTask = useCallback((task: Task) => {
    const lockedByOther = task.is_locked && task.locked_by !== user?.id;
    if (isManagerOfTask(task)) return !lockedByOther;
    if (!user) return false;
    return task.assigned_to === user.id && task.status !== 'in_review' && task.status !== 'ready';
  }, [user, isManagerOfTask]);

  const onDragEnd = async (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceCol = columns[source.droppableId];
    const destCol = columns[destination.droppableId];
    const task = sourceCol.tasks[source.index];

    if (!canModifyTask(task)) return;

    const newSourceTasks = Array.from(sourceCol.tasks);
    const [moved] = newSourceTasks.splice(source.index, 1);

    const updatedTask: Task = { ...moved, status: destination.droppableId };
    if (destination.droppableId === 'in_progress') {
      updatedTask.is_locked = true;
      // El bloqueo debe quedar a nombre de quien realmente va a trabajar la
      // tarea (el asignado), no de quien la arrastra: el jefe puede mover
      // tareas de otras personas y no debe aparecer como que él la toma.
      // Si no tiene asignado, cae a quien la movió (si no, locked_by=null
      // dejaría al jefe bloqueado afuera de su propia acción).
      updatedTask.locked_by = task.assigned_to || user?.id || null;
    } else if (source.droppableId === 'in_progress') {
      updatedTask.is_locked = false;
      updatedTask.locked_by = null;
    }

    if (source.droppableId === destination.droppableId) {
      newSourceTasks.splice(destination.index, 0, updatedTask);
      setColumns(prev => ({ ...prev, [source.droppableId]: { ...sourceCol, tasks: newSourceTasks } }));
    } else {
      const newDestTasks = Array.from(destCol.tasks);
      newDestTasks.splice(destination.index, 0, updatedTask);
      setColumns(prev => ({
        ...prev,
        [source.droppableId]: { ...sourceCol, tasks: newSourceTasks },
        [destination.droppableId]: { ...destCol, tasks: newDestTasks },
      }));
    }

    const { error } = await supabase
      .from('tasks')
      .update({
        status: updatedTask.status,
        is_locked: updatedTask.is_locked,
        locked_by: updatedTask.locked_by,
      })
      .eq('id', task.id);

    if (error) {
      console.error('Error al mover la tarea, revirtiendo:', error);
      fetchTasks();
    }
  };

  return (
    <>
      <header className="mb-6 flex justify-between items-end">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors self-start text-sm font-bold bg-[var(--bg-column)] border border-[var(--border-column)] px-3 py-1.5 rounded-[6px] shadow-[var(--shadow-subtle)] hover:border-[var(--btn-primary-bg)] active:scale-[0.97]"
          >
            <ArrowLeft size={16} />
            Volver al Panel
          </button>
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-1">Tablero Técnico</h1>
            <p className="text-[var(--text-secondary)]">Gestión de tareas, auditoría y despliegues.</p>
          </div>
        </div>
        {(profile?.role === 'jefe' || leaderProjectIds.size > 0) && (
          <button
            onClick={() => setIsNewTaskModalOpen(true)}
            className="bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] hover:text-white dark:hover:text-white px-5 py-2.5 rounded-[6px] font-bold tracking-wide transition-all shadow-[0_0_15px_rgba(17,219,220,0.2)] hover:shadow-[0_0_20px_var(--btn-primary-bg)] active:scale-[0.97]"
          >
            + Nueva Tarea
          </button>
        )}
      </header>

      {loading ? (
        <div className="text-[var(--text-secondary)] py-12 text-center">Cargando tareas...</div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-5 gap-4 pb-4 pt-2 h-[calc(100vh-200px)]">
            {Object.values(columns).map(column => (
              <div key={column.id} className="min-w-0 flex flex-col bg-[var(--bg-column)] backdrop-blur-[14px] border border-[var(--border-column)] rounded-[12px] overflow-hidden mb-2 shadow-[var(--shadow-subtle)]">
                <div className="px-4 py-3 font-semibold text-[var(--text-primary)] flex justify-between items-center border-b border-[var(--border-column)] bg-black/5 dark:bg-black/20">
                  {column.title}
                  <span className="bg-[var(--badge-bg)] text-[var(--badge-text)] text-xs font-bold px-2.5 py-1 rounded-[6px]">{column.tasks.length}</span>
                </div>

                <Droppable droppableId={column.id}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="flex-1 p-3 overflow-y-auto flex flex-col gap-3">
                      {column.tasks.map((task, index) => {
                        let accentColor = 'var(--btn-primary-bg)';
                        if (task.item_type === 'Bug') accentColor = '#EF4444';
                        if (task.item_type === 'Refactor') accentColor = '#D15EEE';
                        if (task.item_type === 'Base de Datos') accentColor = '#F59E0B';

                        const editable = canModifyTask(task);

                        return (
                          <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={!editable}>
                            {(provided, snapshot) => {
                              const isDueToday = task.due_date ? new Date(task.due_date).toDateString() === new Date().toDateString() : false;
                              const isOverdue = !!task.due_date && task.status !== 'completed'
                                && new Date(task.due_date) < new Date(new Date().toDateString());
                              return (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => setSelectedTask(task)}
                                  title={!editable ? (task.is_locked ? 'Bloqueada por la persona asignada: nadie más puede moverla' : 'Solo el jefe o la persona asignada pueden mover esta tarea') : undefined}
                                  style={{ ...provided.draggableProps.style, borderLeftColor: accentColor }}
                                  className={`bg-[var(--bg-card)] border border-[var(--border-card)] border-t-[var(--card-bevel)] border-l-[3px] rounded-[8px] p-[var(--kanban-card-padding)] relative cursor-pointer shadow-[var(--shadow-subtle)] hover:bg-[var(--bg-card-hover)] hover:-translate-y-[3px] hover:shadow-[var(--shadow-hover)] hover:border-[var(--btn-primary-bg)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                                    snapshot.isDragging ? '!shadow-[var(--shadow-hover)] scale-[1.02] z-50 hover:border-[var(--btn-primary-bg)] opacity-100' : ''
                                  } ${!editable ? 'opacity-70' : ''}`}
                                >
                                  <div className="flex justify-between items-start mb-2">
                                    <span className="text-[10px] font-bold font-mono bg-[var(--badge-bg)] text-[var(--badge-text)] px-2 py-0.5 rounded-[6px]">
                                      TASK-{task.id.slice(0, 6)}
                                    </span>
                                    {task.is_locked && (
                                      <div className="bg-[var(--badge-locked-bg)] text-[var(--badge-locked-text)] p-1 rounded-full shadow-sm flex items-center justify-center" title="Bloqueo Exclusivo Activo">
                                        <Lock size={12} />
                                      </div>
                                    )}
                                  </div>
                                  <h4 className="font-semibold text-[var(--text-primary)] text-[length:var(--kanban-card-text)] mb-3 leading-snug">{task.title}</h4>
                                  <div className="flex flex-wrap gap-2">
                                    {task.requires_sql && (
                                      <div className="bg-[var(--badge-sql-bg)] text-[var(--badge-sql-text)] border border-[var(--badge-sql-text)]/20 px-[6px] py-[2px] text-[10px] rounded-[6px] flex items-center gap-1" title="Requiere SQL">
                                        <FileCode size={10} />
                                        <span className="font-bold uppercase tracking-wider">SQL</span>
                                      </div>
                                    )}
                                    {task.due_date ? (
                                      <div className={`border px-[6px] py-[2px] text-[10px] rounded-[6px] flex items-center gap-1 ${isOverdue ? 'bg-[var(--badge-locked-bg)] text-[var(--badge-locked-text)] border-[var(--badge-locked-text)]/20' : isDueToday ? 'bg-[var(--badge-urgent-bg)] text-[var(--badge-urgent-text)] border-[var(--badge-urgent-text)]/20' : 'bg-[var(--badge-bg)] text-[var(--badge-text)] border-[var(--badge-text)]/20'}`}>
                                        {isOverdue ? <AlertTriangle size={10} /> : <Clock size={10} />}
                                        <span className="font-bold">{isOverdue ? 'Atrasada' : new Date(task.due_date).toLocaleDateString()}</span>
                                      </div>
                                    ) : (
                                      <div className="bg-[var(--bg-column)] text-[var(--text-secondary)] border border-[var(--border-column)] px-[6px] py-[2px] text-[10px] rounded-[6px] flex items-center opacity-70" title="Sin fecha límite">
                                        <Clock size={10} />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            }}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}

      <TaskModal isOpen={!!selectedTask} onClose={() => setSelectedTask(null)} task={selectedTask} onUpdated={fetchTasks} />
      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        onTaskCreated={() => {
          setIsNewTaskModalOpen(false);
          fetchTasks();
        }}
      />
    </>
  );
}
