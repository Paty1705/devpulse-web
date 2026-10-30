'use client';

import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Lock, FileCode, Clock, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TaskModal } from '@/components/kanban/TaskModal';
import { NewTaskModal } from '@/components/kanban/NewTaskModal';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';

export type Task = {
  id: string;
  title: string;
  status: string;
  project_id: string;
  item_type?: string;
  priority?: string;
  description?: string;
  locked_by?: string | null;
  sql_script?: string | null;
  acceptance_criteria?: string[];
  due_date?: string | null;
  created_at?: string;
};

type Column = {
  id: string;
  title: string;
  tasks: Task[];
};

const INITIAL_COLUMNS: Record<string, Column> = {
  backlog: { id: 'backlog', title: 'Backlog', tasks: [] },
  in_progress: { id: 'in_progress', title: 'En Progreso', tasks: [] },
  in_review: { id: 'in_review', title: 'En Pruebas / Auditoría', tasks: [] },
  ready: { id: 'ready', title: 'Listo para Despliegue', tasks: [] },
  completed: { id: 'completed', title: 'Completado', tasks: [] },
};

export function KanbanBoard() {
  const { profile } = useAuth();
  const router = useRouter();
  const [columns, setColumns] = useState(INITIAL_COLUMNS);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    // RLS will filter this automatically based on project_members
    const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
    
    if (error) {
      console.error("Error fetching tasks:", error);
      setLoading(false);
      return;
    }

    if (data) {
      const newColumns: Record<string, Column> = {
        backlog: { ...INITIAL_COLUMNS.backlog, tasks: [] },
        in_progress: { ...INITIAL_COLUMNS.in_progress, tasks: [] },
        in_review: { ...INITIAL_COLUMNS.in_review, tasks: [] },
        ready: { ...INITIAL_COLUMNS.ready, tasks: [] },
        completed: { ...INITIAL_COLUMNS.completed, tasks: [] },
      };

      data.forEach((task: Task) => {
        const colId = task.status || 'backlog';
        if (newColumns[colId]) {
          newColumns[colId].tasks.push(task);
        }
      });

      setColumns(newColumns);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();

    const subscription = supabase
      .channel('tasks_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        fetchTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;

    if (source.droppableId !== destination.droppableId || source.index !== destination.index) {
      const sourceCol = columns[source.droppableId];
      const destCol = columns[destination.droppableId];
      const sourceTasks = [...sourceCol.tasks];
      const destTasks = source.droppableId === destination.droppableId ? sourceTasks : [...destCol.tasks];
      
      const [removed] = sourceTasks.splice(source.index, 1);
      
      removed.status = destination.droppableId;
      if (source.droppableId !== destination.droppableId) {
        destTasks.splice(destination.index, 0, removed);
      }

      setColumns({
        ...columns,
        [source.droppableId]: { ...sourceCol, tasks: sourceTasks },
        [destination.droppableId]: { ...destCol, tasks: destTasks }
      });

      const { error } = await supabase
        .from('tasks')
        .update({ status: destination.droppableId })
        .eq('id', draggableId);

      if (error) {
        console.error("Error al mover la tarea:", error);
        fetchTasks();
      }
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-[var(--text-secondary)]">Cargando tablero...</div>;
  }

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
        {profile?.role === 'jefe' && (
          <button 
            onClick={() => setIsNewTaskModalOpen(true)}
            className="bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-[var(--btn-primary-text)] hover:text-white dark:hover:text-white px-5 py-2.5 rounded-[6px] font-bold tracking-wide transition-all shadow-[0_0_15px_rgba(17,219,220,0.2)] hover:shadow-[0_0_20px_var(--btn-primary-bg)] active:scale-[0.97]"
          >
            + Nueva Tarea
          </button>
        )}
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 pt-2 h-[calc(100vh-200px)]">
        {Object.values(columns).map(column => (
          <div key={column.id} className="min-w-[300px] w-[300px] flex flex-col bg-[var(--bg-column)] backdrop-blur-[14px] border border-[var(--border-column)] rounded-[12px] overflow-hidden mb-2 shadow-[var(--shadow-subtle)]">
            <div className="px-4 py-3 font-semibold text-[var(--text-primary)] flex justify-between items-center border-b border-[var(--border-column)] bg-black/5 dark:bg-black/20">
              {column.title}
              <span className="bg-[var(--badge-bg)] text-[var(--badge-text)] text-xs font-bold px-2.5 py-1 rounded-[6px]">{column.tasks.length}</span>
            </div>
            
            <Droppable droppableId={column.id}>
              {(provided) => (
                <div 
                  ref={provided.innerRef} 
                  {...provided.droppableProps}
                  className="flex-1 p-3 overflow-y-auto flex flex-col gap-3 min-h-[150px]"
                >
                  {column.tasks.map((task, index) => {
                    let accentColor = 'var(--btn-primary-bg)';
                    if (task.item_type === 'Bug') accentColor = '#EF4444';
                    if (task.item_type === 'Refactor') accentColor = '#D15EEE';
                    if (task.item_type === 'Base de Datos') accentColor = '#F59E0B';
                    
                    return (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(provided, snapshot) => {
                        const isDueToday = task.due_date ? new Date(task.due_date).toDateString() === new Date().toDateString() : false;
                        
                        return (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          onClick={() => setSelectedTask(task)}
                          style={{
                            ...provided.draggableProps.style,
                            borderLeftColor: accentColor,
                          }}
                          className={`animate-fade-in-up bg-[var(--bg-card)] border border-[var(--border-card)] border-t-[var(--card-bevel)] border-l-[3px] rounded-[8px] p-[var(--kanban-card-padding)] relative cursor-pointer shadow-[var(--shadow-subtle)] hover:bg-[var(--bg-card-hover)] hover:-translate-y-[3px] hover:shadow-[var(--shadow-hover)] hover:border-[var(--btn-primary-bg)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                            snapshot.isDragging ? '!shadow-[var(--shadow-hover)] scale-[1.02] z-50 hover:border-[var(--btn-primary-bg)] opacity-100' : ''
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold font-mono bg-[var(--badge-bg)] text-[var(--badge-text)] px-2 py-0.5 rounded-[6px]">
                              TASK-{task.id.substring(0,6)}
                            </span>
                            {task.locked_by && (
                              <div className="bg-[var(--badge-locked-bg)] text-[var(--badge-locked-text)] p-1 rounded-full shadow-sm flex items-center justify-center" title="Bloqueo Exclusivo Activo">
                                <Lock size={12} />
                              </div>
                            )}
                          </div>
                          <h4 className="font-semibold text-[var(--text-primary)] text-[length:var(--kanban-card-text)] mb-3 leading-snug">{task.title}</h4>
                          <div className="flex gap-2">
                            {task.sql_script && (
                              <div className="bg-[var(--badge-sql-bg)] text-[var(--badge-sql-text)] border border-[var(--badge-sql-text)]/20 px-[6px] py-[2px] text-[10px] rounded-[6px] flex items-center gap-1" title="Requiere SQL">
                                <FileCode size={10} />
                                <span className="font-bold uppercase tracking-wider">SQL</span>
                              </div>
                            )}
                            {task.due_date ? (
                              <div className={`border px-[6px] py-[2px] text-[10px] rounded-[6px] flex items-center gap-1 ${isDueToday ? 'bg-[var(--badge-urgent-bg)] text-[var(--badge-urgent-text)] border-[var(--badge-urgent-text)]/20' : 'bg-[var(--badge-bg)] text-[var(--badge-text)] border-[var(--badge-text)]/20'}`}>
                                <Clock size={10} />
                                <span className="font-bold">{new Date(task.due_date).toLocaleDateString()}</span>
                              </div>
                            ) : (
                              <div className="bg-[var(--bg-column)] text-[var(--text-secondary)] border border-[var(--border-column)] px-[6px] py-[2px] text-[10px] rounded-[6px] flex items-center opacity-70" title="Sin fecha límite">
                                <Clock size={10} />
                              </div>
                            )}
                          </div>
                        </div>
                        )
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
    <TaskModal 
      isOpen={!!selectedTask} 
      onClose={() => {
        setSelectedTask(null);
        fetchTasks();
      }} 
      task={selectedTask} 
    />
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
