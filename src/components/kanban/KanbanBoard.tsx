'use client';

import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Lock, FileCode, CheckCircle, Clock, ArrowLeft } from 'lucide-react';

// Tipos base para el Kanban
type Task = {
  id: string;
  title: string;
  is_locked: boolean;
  requires_sql: boolean;
  item_type?: string;
  due_date?: string | null;
};

type Column = {
  id: string;
  title: string;
  tasks: Task[];
};

const initialColumns: Record<string, Column> = {
  backlog: { id: 'backlog', title: 'Backlog', tasks: [{ id: 't1', title: 'Diseñar BD', is_locked: false, requires_sql: true }] },
  in_progress: { id: 'in_progress', title: 'En Progreso', tasks: [{ id: 't2', title: 'API Login', is_locked: true, requires_sql: false }] },
  in_review: { id: 'in_review', title: 'En Pruebas / Auditoría', tasks: [] },
  ready: { id: 'ready', title: 'Listo para Despliegue', tasks: [] },
  completed: { id: 'completed', title: 'Completado', tasks: [] },
};

import { TaskModal } from '@/components/kanban/TaskModal';
import { NewTaskModal } from '@/components/kanban/NewTaskModal';
import { useAuth } from '@/components/providers/AuthProvider';

import { useRouter } from 'next/navigation';

export function KanbanBoard() {
  const { profile } = useAuth();
  const router = useRouter();
  const [columns, setColumns] = useState(initialColumns);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);

  const handleCreateTask = (taskData: { title: string; requires_sql: boolean; due_date: string | null }) => {
    const newTask: Task = {
      id: Math.random().toString(36).substring(2, 9), // ID simulado
      title: taskData.title,
      is_locked: false,
      requires_sql: taskData.requires_sql,
      due_date: taskData.due_date,
    };

    setColumns(prev => ({
      ...prev,
      backlog: {
        ...prev.backlog,
        tasks: [...prev.backlog.tasks, newTask]
      }
    }));
  };

  const onDragEnd = (result: DropResult) => {
    // ... drag logic remains the same
    const { source, destination } = result;
    if (!destination) return;

    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    const sourceCol = columns[source.droppableId];
    const destCol = columns[destination.droppableId];
    
    const task = sourceCol.tasks[source.index];

    const newSourceTasks = Array.from(sourceCol.tasks);
    const [removed] = newSourceTasks.splice(source.index, 1);
    
    if (source.droppableId === destination.droppableId) {
      newSourceTasks.splice(destination.index, 0, removed);
      setColumns({
        ...columns,
        [source.droppableId]: { ...sourceCol, tasks: newSourceTasks }
      });
    } else {
      const newDestTasks = Array.from(destCol.tasks);
      newDestTasks.splice(destination.index, 0, removed);
      
      if (destination.droppableId === 'in_progress') {
        removed.is_locked = true;
      } else if (source.droppableId === 'in_progress') {
        removed.is_locked = false;
      }

      setColumns({
        ...columns,
        [source.droppableId]: { ...sourceCol, tasks: newSourceTasks },
        [destination.droppableId]: { ...destCol, tasks: newDestTasks }
      });
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
                  className="flex-1 p-3 overflow-y-auto flex flex-col gap-3"
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
                            animationDelay: `${index * 50}ms`
                          }}
                          className={`animate-fade-in-up opacity-0 bg-[var(--bg-card)] border border-[var(--border-card)] border-t-[var(--card-bevel)] border-l-[3px] rounded-[8px] p-[var(--kanban-card-padding)] relative cursor-pointer shadow-[var(--shadow-subtle)] hover:bg-[var(--bg-card-hover)] hover:-translate-y-[3px] hover:shadow-[var(--shadow-hover)] hover:border-[var(--btn-primary-bg)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                            snapshot.isDragging ? '!shadow-[var(--shadow-hover)] scale-[1.02] z-50 hover:border-[var(--btn-primary-bg)] opacity-100' : ''
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold font-mono bg-[var(--badge-bg)] text-[var(--badge-text)] px-2 py-0.5 rounded-[6px]">
                              TASK-{task.id}
                            </span>
                            {task.is_locked && (
                              <div className="bg-[var(--badge-locked-bg)] text-[var(--badge-locked-text)] p-1 rounded-full shadow-sm flex items-center justify-center" title="Bloqueo Exclusivo Activo">
                                <Lock size={12} />
                              </div>
                            )}
                          </div>
                          <h4 className="font-semibold text-[var(--text-primary)] text-[length:var(--kanban-card-text)] mb-3 leading-snug">{task.title}</h4>
                          <div className="flex gap-2">
                            {task.requires_sql && (
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
      onClose={() => setSelectedTask(null)} 
      task={selectedTask} 
    />
    <NewTaskModal 
      isOpen={isNewTaskModalOpen}
      onClose={() => setIsNewTaskModalOpen(false)}
      onTaskCreated={() => {
        // En una app real haríamos refetch de Supabase aquí
        setIsNewTaskModalOpen(false);
      }}
    />
  </>
  );
}
